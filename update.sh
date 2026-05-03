#!/bin/bash
# 7B Records Update Script
# This script pulls the latest code and rebuilds the app without deleting user data.

set -e # Exit on error

echo "🔄 [1/4] Detecting project environment..."
# Find the project root
if [ -f "package.json" ]; then
    ROOT=$(pwd)
elif [ -d "../7B_records" ]; then
    ROOT="../7B_records"
elif [ -d "../7B-Records" ]; then
    ROOT="../7B-Records"
else
    echo "❌ Error: Could not find project root. Please run this from inside the 7B Records folder."
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
