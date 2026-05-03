#!/bin/bash
# 7B Records Update Script
# This script pulls the latest code and rebuilds the app without deleting user data.

set -e # Exit on error

echo "🔄 [1/4] Detecting project environment..."
# Find the project root by looking for package.json in typical locations
if [ -f "package.json" ]; then
    ROOT=$(pwd)
elif [ -d "$HOME/7B_records" ]; then
    ROOT="$HOME/7B_records"
elif [ -d "$HOME/7B-Records" ]; then
    ROOT="$HOME/7B-Records"
else
    # Try one last check in the current folder's parent
    if [ -f "../package.json" ]; then
        ROOT=$(cd .. && pwd)
    else
        echo "❌ Error: Could not find project root (package.json). Please run this from inside the 7B Records folder."
        exit 1
    fi
fi

cd "$ROOT"
echo "📍 Working in: $ROOT"

echo "📥 [2/4] Pulling latest updates from GitHub..."
# Try to pull, but don't exit if it fails (e.g. no internet or local changes)
git pull origin main || git pull || echo "⚠️  Git pull failed. You may need to manually resolve conflicts."

echo "📦 [3/4] refreshing dependencies..."
# Ensure pip3 is available
sudo apt update && sudo apt install -y python3-pip
# Robust catt install
if ! command -v catt &> /dev/null && ! [ -f "$HOME/.local/bin/catt" ]; then
    sudo apt install -y catt || pip3 install catt --break-system-packages --user || pip3 install catt --user || echo "⚠️  Could not install catt."
fi
npm install

echo "🏗️  [4/4] Rebuilding UI..."
npm run build

echo "✅ UPDATE COMPLETE!"
echo "--------------------------------------------------"
echo "If the server is running, please restart it."
echo "Or use the '7B Records' icon on your Desktop."
echo "--------------------------------------------------"
