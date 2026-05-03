#!/bin/bash
echo "🔄 Updating 7B Records..."

# Check if we are in a git repo
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository. Cannot update automatically."
    exit 1
fi

echo "📥 Pulling latest changes..."
git pull

echo "📦 Installing/Updating dependencies..."
npm install

echo "🏗️  Rebuilding application..."
npm run build

echo "✅ Update complete! Please restart your server (or use the Desktop icon)."
