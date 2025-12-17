#!/bin/bash
# bazzeye_uninstall.sh
# Removes Bazzeye service and built artifacts

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}WARNING: This will remove the Bazzeye system service and delete local build artifacts/runtime.${NC}"
read -p "Are you sure you want to proceed? (y/N) " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# 1. Remove Service
if systemctl is-active --quiet bazzeye 2>/dev/null || systemctl is-enabled --quiet bazzeye 2>/dev/null; then
    echo "Stopping and removing system service..."
    
    if [ "$EUID" -ne 0 ]; then
        echo "Root privileges required to remove service."
        sudo systemctl disable --now bazzeye || true
        sudo rm -f /etc/systemd/system/bazzeye.service
        sudo systemctl daemon-reload
        echo "Service removed."
    else
        systemctl disable --now bazzeye || true
        rm -f /etc/systemd/system/bazzeye.service
        systemctl daemon-reload
        echo "Service removed."
    fi
else
    echo "Service not active or not installed."
fi



# Remove Sudoers Config
if [ -f "/etc/sudoers.d/bazzeye" ]; then
    echo "Removing sudoers configuration (/etc/sudoers.d/bazzeye)..."
    if [ "$EUID" -ne 0 ]; then
        sudo rm -f /etc/sudoers.d/bazzeye
    else
        rm -f /etc/sudoers.d/bazzeye
    fi
fi

# Remove bazzeye config file
if [ -f "/etc/bazzeye.conf" ]; then
    echo "Removing config file (/etc/bazzeye.conf)..."
    if [ "$EUID" -ne 0 ]; then
        sudo rm -f /etc/bazzeye.conf
    else
        rm -f /etc/bazzeye.conf
    fi
fi

# Remove bazzeye system user
if id -u bazzeye &>/dev/null; then
    echo "Removing 'bazzeye' system user..."
    if [ "$EUID" -ne 0 ]; then
        sudo userdel bazzeye || echo "Warning: Failed to remove bazzeye user"
    else
        userdel bazzeye || echo "Warning: Failed to remove bazzeye user"
    fi
fi

# 2. Remove Artifacts

echo "Cleaning up local files..."
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Runtime
if [ -d "$CURRENT_DIR/runtime" ]; then
    echo "Removing runtime/..."
    rm -rf "$CURRENT_DIR/runtime"
fi

# Build Artifacts
rm -rf "$CURRENT_DIR/server/dist"
rm -rf "$CURRENT_DIR/client/dist"
rm -rf "$CURRENT_DIR/server/node_modules"
rm -rf "$CURRENT_DIR/client/node_modules"
rm -f "$CURRENT_DIR/server/storage/package-cache.json"

# 3. Remove Container
CONTAINER="bazzeye-builder"
if command -v distrobox &> /dev/null; then
    # Check if container exists with or without root flags
    # We try both just in case
    if distrobox list | grep -q "$CONTAINER"; then
        echo "Removing build container ($CONTAINER)..."
        distrobox rm -f "$CONTAINER" || echo "Warning: Failed to remove container."
    elif distrobox list --root | grep -q "$CONTAINER"; then
        echo "Removing rootful build container ($CONTAINER)..."
        distrobox rm --root -f "$CONTAINER" || echo "Warning: Failed to remove root container."
    fi
fi

echo -e "${GREEN}Uninstall Complete!${NC}"
echo "Note: The source code directory was not removed. You can delete '$CURRENT_DIR' manually if you wish."
