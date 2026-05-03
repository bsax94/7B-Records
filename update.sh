#!/bin/bash
# 7B Records Update Script
# This script pulls the latest code and rebuilds the app without deleting user data.

set -e # Exit on error

echo "🔄 [1/4] Detecting project environment..."
# Detect if we should use full path or local path
if [ -d "$HOME/7B_records" ]; then
    ROOT="$HOME/7B_records"
elif [ -d "$HOME/7B-Records" ]; then
    ROOT="$HOME/7B-Records"
elif [ -f "package.json" ]; then
    ROOT=$(pwd)
else
    echo "❌ Error: Could not find project root."
    exit 1
fi

cd "$ROOT"
echo "📍 Working in: $ROOT"

echo "📥 [2/4] Pulling latest updates from GitHub..."
git pull origin main || echo "⚠️  Git pull failed. You may have local changes. Continuing anyway..."

echo "📦 [3/4] refreshing dependencies..."
npm install

echo "🏗️  [4/4] Rebuilding UI..."
npm run build

echo "✅ UPDATE COMPLETE!"
echo "--------------------------------------------------"
echo "If the server is running, please restart it."
echo "Or use the '7B Records' icon on your Desktop."
echo "--------------------------------------------------"
