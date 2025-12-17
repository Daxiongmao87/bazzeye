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
    echo "Ensuring build dependencies (build tools)..."
    # Wrap in bash -c to avoid OCI/ioctl errors
    # Note: We do NOT install nodejs/npm here. We use the bundled one.
    if ! distrobox enter $DBX_FLAGS "$CONTAINER" -- bash -c "sudo dnf install -y git python3 make gcc-c++"; then
        echo -e "${RED}Error: Failed to install dependencies in container.${NC}"
        read -p "Continue with service setup anyway? (y/N) " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
    else
        # Build Project
        echo -e "${GREEN}Running Build inside container...${NC}"
        echo "Project Path: $CURRENT_DIR"
        echo "Using Runtime Node: $RUNTIME_DIR/node/bin/node"

        # Execute build
        # We prepend the bundled node bin to PATH so 'npm' and 'node' resolve to it.
        if distrobox enter $DBX_FLAGS "$CONTAINER" -- bash -c "export PATH=\"$CURRENT_DIR/runtime/node/bin:\$PATH\" && echo \"Node version: \$(node -v)\" && cd '$CURRENT_DIR' && npm run install:all && npm run build"; then
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
            read -p "Continue with service setup anyway? (y/N) " -r
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
    ORIGINAL_USER="$USER"
    ORIGINAL_GROUP=$(id -gn)
    WORKING_DIR="$CURRENT_DIR"
    
    # Create dedicated bazzeye system user (if it doesn't exist)
    echo "Setting up bazzeye service user..."
    if ! id -u bazzeye &>/dev/null; then
        echo "Creating 'bazzeye' system user..."
        sudo useradd --system --shell /usr/sbin/nologin --no-create-home bazzeye
    else
        echo "'bazzeye' user already exists."
    fi
    
    # Store original owner in config file
    echo "Storing original owner: $ORIGINAL_USER"
    echo "BAZZEYE_OWNER=$ORIGINAL_USER" | sudo tee /etc/bazzeye.conf > /dev/null
    sudo chmod 644 /etc/bazzeye.conf
    
    # Grant bazzeye user read access to the application directory
    echo "Setting up directory permissions..."
    
    # Make parent directories traversable (e.g., /home/steam needs o+x for bazzeye to cd into subdirs)
    # We iterate up the path and add execute permission for "others" on each parent
    CURRENT_PATH="$WORKING_DIR"
    while [ "$CURRENT_PATH" != "/" ]; do
        PARENT_PATH=$(dirname "$CURRENT_PATH")
        if [ "$PARENT_PATH" != "/" ]; then
            echo "  Ensuring traversal permission on: $PARENT_PATH"
            sudo chmod o+x "$PARENT_PATH" 2>/dev/null || true
        fi
        CURRENT_PATH="$PARENT_PATH"
    done
    
    sudo chown -R "$ORIGINAL_USER:bazzeye" "$WORKING_DIR"
    sudo chmod -R g+rX "$WORKING_DIR"
    # Storage directory needs write access
    sudo chmod -R g+rwX "$WORKING_DIR/server/storage" 2>/dev/null || true
    
    # Generate Service File
    SERVICE_FILE="bazzeye.service"
    EXEC_START="$WORKING_DIR/runtime/node/bin/node $WORKING_DIR/server/dist/index.js"

    echo "Generating $SERVICE_FILE..."
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Bazzeye Server
After=network.target

[Service]
Type=simple
User=bazzeye
Group=bazzeye
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
    
    # Configure sudo permissions for bazzeye user
    echo ""
    echo "----------------------------------------------------------------"
    echo "Configuring sudo permissions for bazzeye service user..."
    echo "(Your user's sudo behavior will NOT be changed)"
    
    # Detect command paths
    CMD_REBOOT=$(command -v reboot || echo "/usr/sbin/reboot")
    CMD_SHUTDOWN=$(command -v shutdown || echo "/usr/sbin/shutdown")
    CMD_SMARTCTL=$(command -v smartctl || echo "/usr/sbin/smartctl")
    CMD_UJUST=$(command -v ujust || echo "/usr/bin/ujust")
    CMD_RPMOSTREE=$(command -v rpm-ostree || echo "/usr/bin/rpm-ostree")
    CMD_TEST=$(command -v test || echo "/usr/bin/test")
    CMD_FIND=$(command -v find || echo "/usr/bin/find")
    CMD_RM=$(command -v rm || echo "/usr/bin/rm")
    CMD_MKDIR=$(command -v mkdir || echo "/usr/bin/mkdir")
    CMD_TOUCH=$(command -v touch || echo "/usr/bin/touch")
    CMD_CHOWN=$(command -v chown || echo "/usr/bin/chown")

    SUDOERS_FILE="/etc/sudoers.d/bazzeye"
    
    echo "Creating sudoers rules for 'bazzeye' service user..."
    # Write sudoers file with separate lines for each command group
    {
        echo "# Bazzeye service user sudo rules"
        echo "# Generated by bazzeye_setup.sh"
        echo ""
        echo "# System control commands (as root)"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_REBOOT"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_SHUTDOWN"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_SMARTCTL"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_UJUST"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_RPMOSTREE"
        echo ""
        echo "# File operation commands (as root)"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_TEST"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_FIND"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_RM"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_MKDIR"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_TOUCH"
        echo "bazzeye ALL=(ALL) NOPASSWD: $CMD_CHOWN"
        echo ""
        echo "# Run any command as original owner: $ORIGINAL_USER"
        echo "bazzeye ALL=($ORIGINAL_USER) NOPASSWD: ALL"
    } | sudo tee "$SUDOERS_FILE" > /dev/null
    sudo chmod 0440 "$SUDOERS_FILE"
    
    # Verify sudoers syntax
    if sudo visudo -cf "$SUDOERS_FILE" &>/dev/null; then
        echo -e "${GREEN}Sudoers configuration applied successfully!${NC}"
    else
        echo -e "${RED}Warning: Sudoers file may have syntax errors. Please check manually.${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}Setup Complete!${NC}"
    echo "The Bazzeye service runs as 'bazzeye' user."
    echo "Terminals and file operations will run as '$ORIGINAL_USER'."
    echo "Your user's sudo behavior is UNCHANGED."
else
    echo "Skipping service installation."
    echo "A 'bazzeye.service' file has NOT been generated to avoid overwriting existing configs."
fi

