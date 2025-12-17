#!/bin/bash
# generate-package-cache.sh
# Generates package cache by downloading Fedora repo metadata directly
# No distrobox/dnf dependencies - works on any system with curl and python3

OUTPUT_FILE="${1:-server/storage/package-cache.json}"
FEDORA_VERSION="${2:-43}"

echo "Generating package cache from Fedora $FEDORA_VERSION repos..." >&2

# Get the metalink and extract a proper mirror URL
METALINK="https://mirrors.fedoraproject.org/metalink?repo=fedora-${FEDORA_VERSION}&arch=x86_64"
REPOMD_URL=$(curl -sL "$METALINK" 2>/dev/null | grep -oP 'https://[^"<>]*repomd\.xml' | head -1)

if [[ -z "$REPOMD_URL" ]]; then
    echo "Could not find Fedora mirror, trying direct URL" >&2
    REPOMD_URL="https://download.fedoraproject.org/pub/fedora/linux/releases/${FEDORA_VERSION}/Everything/x86_64/os/repodata/repomd.xml"
fi

# Get the base URL (parent of repodata/)
BASE_URL=$(dirname "$(dirname "$REPOMD_URL")")/
echo "Using base: $BASE_URL" >&2

# Find the primary.xml file from repomd.xml - location includes relative path like "repodata/..."
PRIMARY_HREF=$(curl -sL "$REPOMD_URL" 2>/dev/null | grep -oP 'location href="[^"]*primary\.xml[^"]*"' | head -1 | sed 's/location href="//;s/"$//')

if [[ -z "$PRIMARY_HREF" ]]; then
    echo "Could not find primary.xml in repomd.xml" >&2
    echo "[]" > "$OUTPUT_FILE"
    exit 1
fi

DOWNLOAD_URL="${BASE_URL}${PRIMARY_HREF}"
echo "Downloading: $DOWNLOAD_URL" >&2

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Download the file
curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/primary.compressed" 2>/dev/null

FILE_TYPE=$(file "$TEMP_DIR/primary.compressed" 2>/dev/null)

# Decompress based on type
if echo "$FILE_TYPE" | grep -q "Zstandard"; then
    zstd -d "$TEMP_DIR/primary.compressed" -o "$TEMP_DIR/primary.xml" 2>/dev/null
elif echo "$FILE_TYPE" | grep -q "gzip"; then
    gunzip -c "$TEMP_DIR/primary.compressed" > "$TEMP_DIR/primary.xml" 2>/dev/null
elif echo "$FILE_TYPE" | grep -q "XZ"; then
    xz -d -c "$TEMP_DIR/primary.compressed" > "$TEMP_DIR/primary.xml" 2>/dev/null
else
    echo "Unknown compression format: $FILE_TYPE" >&2
    echo "[]" > "$OUTPUT_FILE"
    exit 1
fi

if [[ ! -s "$TEMP_DIR/primary.xml" ]]; then
    echo "Failed to decompress primary.xml" >&2
    echo "[]" > "$OUTPUT_FILE"
    exit 1
fi

echo "Parsing package metadata..." >&2

# Parse the XML to extract package names
python3 << 'PYTHON_SCRIPT' - "$TEMP_DIR/primary.xml" "$OUTPUT_FILE"
import sys
import xml.etree.ElementTree as ET
import json

input_file = sys.argv[1]
output_file = sys.argv[2]

packages = []
seen = set()

try:
    # Parse the XML incrementally to handle large files
    for event, elem in ET.iterparse(input_file, events=['end']):
        if elem.tag.endswith('}package') or elem.tag == 'package':
            # Extract name
            name_elem = None
            for child in elem:
                if child.tag.endswith('}name') or child.tag == 'name':
                    name_elem = child
                    break
            
            if name_elem is None or not name_elem.text:
                elem.clear()
                continue
                
            pkg_name = name_elem.text
            
            # Skip debug packages
            if pkg_name.endswith('-debuginfo') or pkg_name.endswith('-debugsource'):
                elem.clear()
                continue
            
            # Skip if already seen
            if pkg_name in seen:
                elem.clear()
                continue
            seen.add(pkg_name)
            
            # Get optional fields
            summary = ''
            version = ''
            arch = ''
            
            for child in elem:
                if child.tag.endswith('}summary') or child.tag == 'summary':
                    summary = (child.text or '')[:200]
                elif child.tag.endswith('}version') or child.tag == 'version':
                    version = child.get('ver', '')
                elif child.tag.endswith('}arch') or child.tag == 'arch':
                    arch = child.text or ''
            
            packages.append({
                'name': pkg_name,
                'summary': summary,
                'version': version,
                'arch': arch
            })
            
            # Clear element to save memory
            elem.clear()
    
    with open(output_file, 'w') as f:
        json.dump(packages, f)
    
    print(f"Generated {len(packages)} packages", file=sys.stderr)
    
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    with open(output_file, 'w') as f:
        json.dump([], f)
    sys.exit(1)
PYTHON_SCRIPT
