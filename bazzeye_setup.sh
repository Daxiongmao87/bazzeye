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
# Check/Create Container
echo "Checking build container..."
# Distrobox might return non-zero if list is empty, handle carefully
if distrobox list $DBX_FLAGS | grep -q "$CONTAINER"; then
    echo "Container $CONTAINER found. Skipping creation."
else
    echo "Creating build container ($CONTAINER)..."
    distrobox create $DBX_FLAGS --name "$CONTAINER" --image "$IMAGE" --yes
fi

# Build Loop
echo ""
read -p "Do you want to build/rebuild the project inside the container? (Y/n) " -r
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    # Install Dependencies in Container
    echo "Ensuring build dependencies (Node.js, npm, build tools)..."
    # Wrap in bash -c to avoid OCI/ioctl errors
    if ! distrobox enter $DBX_FLAGS "$CONTAINER" -- bash -c "sudo dnf install -y nodejs npm git python3 make gcc-c++"; then
        echo -e "${RED}Error: Failed to install dependencies in container.${NC}"
        read -p "Continue with setting up Runtime/Service anyway? (y/N) " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
    else
        # Build Project
        echo -e "${GREEN}Running Build inside container...${NC}"
        echo "Project Path: $CURRENT_DIR"

        # Execute build
        # usage: npm run install:all && npm run build
        if distrobox enter $DBX_FLAGS "$CONTAINER" -- bash -c "cd '$CURRENT_DIR' && npm run install:all && npm run build"; then
             # Generate Package Cache
            echo -e "${GREEN}Generating package cache...${NC}"
            mkdir -p "$CURRENT_DIR/server/storage"
            # execute this inside container too? or host? Host is fine if rpm-ostree exists.
            # But the script uses rpm-ostree which is on host.
            bash "$CURRENT_DIR/scripts/generate-package-cache.sh" "$CURRENT_DIR/server/storage/package-cache.json" 43 || true
            
            CACHE_COUNT=$(grep -c '"name"' "$CURRENT_DIR/server/storage/package-cache.json" 2>/dev/null || echo "0")
            echo -e "${GREEN}Package cache generated with $CACHE_COUNT packages${NC}"
            echo -e "${GREEN}Build Complete!${NC}"
            
            # Cleanup (Optional)
            echo "Cleaning up build container..."
            distrobox rm $DBX_FLAGS -f "$CONTAINER" || echo "Warning: Failed to remove container $CONTAINER"
        else
            echo -e "${RED}Build failed.${NC}"
            read -p "Continue with setting up Runtime/Service anyway? (y/N) " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
        fi
    fi
else
    echo "Skipping build process..."
fi



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
    
    # Verification
    if [ ! -f "$RUNTIME_DIR/node/bin/node" ]; then
        echo -e "${RED}Error: Node.js binary not found at $RUNTIME_DIR/node/bin/node${NC}"
        echo "Extraction might have failed or folder structure changed."
        exit 1
    fi
    


    echo "Node.js setup complete."
else
    echo "Node.js runtime already exists."
fi

# Permissions & SELinux (Critical for Systemd on Fedora/Bazzite)
# We apply this every time to ensure updates/copies didn't break it
echo "Applying permissions..."
chmod +x "$RUNTIME_DIR/node/bin/node"

# restorecon reverts to default policy (which might be 'user_home_t' -> non-executable by systemd)
# We MUST use chcon to force 'bin_t' or 'unconfined_exec_t' so systemd can exec it.
if command -v chcon &> /dev/null; then
    echo "Forcing SELinux executable context (bin_t)..."
    chcon -R -t bin_t "$RUNTIME_DIR" || echo "Warning: SELinux chcon failed"
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
        sudo systemctl reset-failed bazzeye || true
        sudo systemctl enable --now bazzeye
    else
        cp "$SERVICE_FILE" /etc/systemd/system/
        systemctl daemon-reload
        systemctl reset-failed bazzeye || true
        systemctl enable --now bazzeye
    fi
    echo -e "${GREEN}Service installed and started!${NC}"
    echo "Check status with: systemctl status bazzeye"
else
    echo "Skipping service installation."
    echo "A 'bazzeye.service' file has NOT been generated to avoid overwriting existing configs."
fi

# Sudo Permissions
echo ""
echo "----------------------------------------------------------------"
echo "Bazzeye supports system controls like Reboot, Shutdown, and Update."
echo "Running as a regular user requires password-less sudo permission for these specific commands."
read -p "Do you want to configure password-less sudo for Bazzeye controls? (y/N) " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Detect paths
    CMD_REBOOT=$(command -v reboot || echo "/usr/sbin/reboot")
    CMD_SHUTDOWN=$(command -v shutdown || echo "/usr/sbin/shutdown")
    CMD_SMARTCTL=$(command -v smartctl || echo "/usr/sbin/smartctl")
    CMD_UJUST=$(command -v ujust || echo "/usr/bin/ujust")
    CMD_RPMOSTREE=$(command -v rpm-ostree || echo "/usr/bin/rpm-ostree")
    CMD_SYSTEMCTL=$(command -v systemctl || echo "/usr/bin/systemctl") # Optional if you want app to control services

    SUDOERS_FILE="/etc/sudoers.d/bazzeye"
    USER_NAME="$USER"
    
    # Check if we are root
    if [ "$EUID" -ne 0 ]; then
        echo "Root privileges required to write to $SUDOERS_FILE"
        # We construct the file locally then move it? Or justtee. 
        # Using tee is safer.
        echo "Creating sudoers rule for user '$USER_NAME'..."
        
        # Rule: user ALL=(ALL) NOPASSWD: path1, path2...
        RULE="$USER_NAME ALL=(ALL) NOPASSWD: $CMD_REBOOT, $CMD_SHUTDOWN, $CMD_SMARTCTL, $CMD_UJUST, $CMD_RPMOSTREE"
        
        # We use a temp file
        echo "$RULE" | sudo tee "$SUDOERS_FILE" > /dev/null
        sudo chmod 0440 "$SUDOERS_FILE"
        echo "Sudoers configuration applied!"
    else
        echo "Creating sudoers rule for user '$USER_NAME'..."
        RULE="$USER_NAME ALL=(ALL) NOPASSWD: $CMD_REBOOT, $CMD_SHUTDOWN, $CMD_SMARTCTL, $CMD_UJUST, $CMD_RPMOSTREE"
        echo "$RULE" > "$SUDOERS_FILE"
        chmod 0440 "$SUDOERS_FILE"
        echo "Sudoers configuration applied!"
    fi
else
    echo "Skipping sudoers configuration."
    echo "If you want to use system controls later, you may need to configure sudo yourself."
fi


