#!/bin/bash

# update.sh
# Quickly updates Bazzeye to the latest version from git.

set -e

echo "⬇️  Pulling latest changes..."
git pull

echo "📦 Installing dependencies..."
# Use the root install:all script for consistency
npm run install:all

echo "🏗️  Rebuilding..."
npm run build

echo "🔄 Restarting Service..."
# Try to restart the user service if it exists
if systemctl --user is-active --quiet bazzeye.service; then
    systemctl --user restart bazzeye.service
    echo "✅ Service restarted!"
else
    echo "⚠️  Service not found or not active. Please restart manually if running."
fi

echo "🎉 Update Complete!"
