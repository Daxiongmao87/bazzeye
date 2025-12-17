#!/bin/bash
# start_server.sh
# Starts the Bazzeye server using the bundled runtime

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$CURRENT_DIR/runtime/node/bin/node"

if [ ! -f "$NODE_BIN" ]; then
    echo "Error: Node.js runtime not found. Please run ./bazzeye_setup.sh first."
    exit 1
fi

echo "Starting Bazzeye Server..."
exec "$NODE_BIN" "$CURRENT_DIR/server/dist/index.js"
