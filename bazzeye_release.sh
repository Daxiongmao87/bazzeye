#!/bin/bash

# release.sh
# Handles version bumping for the Bazzeye project.
# Usage: ./scripts/release.sh <major|minor|patch>

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <major|minor|patch>"
  exit 1
fi

VERSION_TYPE=$1

echo "👁️  Releasing new version ($VERSION_TYPE)..."

# 1. Update Root Package
echo "📦 Updating root package.json..."
npm version $VERSION_TYPE --no-git-tag-version

# Get the new version number
NEW_VERSION=$(node -p "require('./package.json').version")
echo "   -> New Version: $NEW_VERSION"

# 2. Update Server Package
echo "📦 Updating server/package.json..."
cd server
npm version $NEW_VERSION --no-git-tag-version --allow-same-version
cd ..

# 3. Update Client Package
echo "📦 Updating client/package.json..."
cd client
npm version $NEW_VERSION --no-git-tag-version --allow-same-version
cd ..

echo "✅ All package.json files updated to $NEW_VERSION"

# 4. Commit and Tag
echo "💾 Committing and tagging..."
git add package.json server/package.json client/package.json
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "🎉 Release v$NEW_VERSION ready!"
echo "Run 'git push && git push --tags' to publish."
