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

# Cleanup
echo "Cleaning up build container..."
distrobox rm $DBX_FLAGS -f "$CONTAINER" || echo "Warning: Failed to remove container $CONTAINER"

# Runtime Setup
echo -e "${GREEN}Setting up Runtime Environment...${NC}"
NODE_VERSION="v22.12.0"
NODE_DIST="node-${NODE_VERSION}-linux-x64"
RUNTIME_DIR="$CURRENT_DIR/runtime"

if [ ! -d "$RUNTIME_DIR/node/bin" ]; then
    echo "Downloading Node.js ${NODE_VERSION}..."
    mkdir -p "$RUNTIME_DIR"
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.xz" -o "$RUNTIME_DIR/node.tar.xz"
    
    echo "Extracting Node.js..."
    mkdir -p "$RUNTIME_DIR/node"
    tar -xJf "$RUNTIME_DIR/node.tar.xz" -C "$RUNTIME_DIR/node" --strip-components=1
    rm "$RUNTIME_DIR/node.tar.xz"
    echo "Node.js setup complete."
else
    echo "Node.js runtime already exists."
fi

echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "You can now run the server manually using: ./start_server.sh"

# Service Installation
echo ""
echo "----------------------------------------------------------------"
read -p "Do you want to install Bazzeye as a system service? (y/N) " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Generate Service File
    SERVICE_FILE="bazzeye.service"
    SERVICE_USER="$USER"
    SERVICE_GROUP=$(id -gn)
    WORKING_DIR="$CURRENT_DIR"
    EXEC_START="$WORKING_DIR/runtime/node/bin/node $WORKING_DIR/server/dist/index.js"

    echo "Generating $SERVICE_FILE..."
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Bazzeye Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$WORKING_DIR
ExecStart=$EXEC_START
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

    echo "Installing service..."
    if [ "$EUID" -ne 0 ]; then
        echo "Root privileges required to install service."
        sudo cp "$SERVICE_FILE" /etc/systemd/system/
        sudo systemctl daemon-reload
        sudo systemctl enable --now bazzeye
    else
        cp "$SERVICE_FILE" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable --now bazzeye
    fi
    echo -e "${GREEN}Service installed and started!${NC}"
    echo "Check status with: systemctl status bazzeye"
else
    echo "Skipping service installation."
    echo "A 'bazzeye.service' file has NOT been generated to avoid overwriting existing configs."
fi


