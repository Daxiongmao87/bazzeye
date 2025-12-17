#!/bin/bash
# bazzite_build.sh
# Automated build script for Bazzeye on Bazzite/Atomic-OS using Distrobox

set -e

CONTAINER="bazzeye-builder"
IMAGE="registry.fedoraproject.org/fedora:43"
CURRENT_DIR="$(pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Bazzeye Build for Bazzite...${NC}"

# Configure Distrobox flags
DBX_FLAGS=""
if [ "$EUID" -eq 0 ]; then
    echo "Running as root - enabling rootful mode (--root)"
    echo "Warning: Unsetting SUDO/DOAS variables to bypass distrobox checks."
    unset SUDO_USER
    unset SUDO_COMMAND
    unset DOAS_USER
    DBX_FLAGS="--root"
fi

# Check for Distrobox
if ! command -v distrobox &> /dev/null; then
    echo -e "${RED}Error: distrobox is not installed.${NC}"
    exit 1
fi

# Check/Create Container
if ! distrobox list $DBX_FLAGS | grep -q "$CONTAINER"; then
    echo "Creating build container ($CONTAINER)..."
    distrobox create $DBX_FLAGS --name "$CONTAINER" --image "$IMAGE" --yes
else
    echo "Container $CONTAINER found."
fi

# Install Dependencies in Container
echo "Ensuring build dependencies (Node.js, npm, build tools)..."
# We ignore errors here in case packages are already installed, or handle gracefully?
# dnf -y install will exit 0 if nothing to do usually.
distrobox enter $DBX_FLAGS "$CONTAINER" -- sudo dnf install -y nodejs npm git python3 make gcc-c++

# Build Project
echo -e "${GREEN}Running Build inside container...${NC}"
echo "Project Path: $CURRENT_DIR"

# Execute build
# usage: npm run install:all && npm run build
distrobox enter $DBX_FLAGS "$CONTAINER" -- bash -c "cd '$CURRENT_DIR' && npm run install:all && npm run build"

# Generate Package Cache
echo -e "${GREEN}Generating package cache...${NC}"
mkdir -p "$CURRENT_DIR/server/storage"
bash "$CURRENT_DIR/scripts/generate-package-cache.sh" "$CURRENT_DIR/server/storage/package-cache.json" 43

CACHE_COUNT=$(grep -c '"name"' "$CURRENT_DIR/server/storage/package-cache.json" 2>/dev/null || echo "0")
echo -e "${GREEN}Package cache generated with $CACHE_COUNT packages${NC}"

echo -e "${GREEN}Build Complete!${NC}"

