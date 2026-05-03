#!/bin/bash

# 7B Records - Raspberry Pi Setup & Desktop Icon Script
echo "🎵 Starting 7B Records Setup for Raspberry Pi..."

# 1. Update and install system dependencies
echo "📦 Installing system dependencies (Icecast, DarkIce, Node.js)..."
sudo apt update
sudo apt install -y icecast2 darkice mkchromecast nodejs npm chromium-browser

# 2. Setup the project folder
# Ensure we are in the correct directory
if [[ "$PWD" != *7B_records* ]]; then
    if [ -d "7B_records" ]; then
        cd 7B_records
    fi
fi

PROJECT_DIR=$(pwd)
echo "📂 Working directory: $PROJECT_DIR"

# 3. Install Node.js dependencies
echo "🚀 Installing application dependencies..."

# Detect if package.json is broken (the user reported a version with lockfileVersion: 3 instead of actual scripts)
if [ -f "package.json" ]; then
    if ! grep -q "\"build\":" "package.json"; then
        echo "⚠️  Detected broken or incomplete package.json. Recreating it..."
        cat <<EOF > package.json
{
  "name": "7b-records",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "node server.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^1.30.2",
    "express": "^4.21.2",
    "lucide-react": "^0.479.0",
    "motion": "^12.4.10",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.13.10",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.3",
    "tailwindcss": "4.0.9",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2"
  }
}
EOF
    fi
    
    npm install
    echo "🏗️ Building the application..."
    npm run build
else
    echo "❌ Error: package.json not found in $PROJECT_DIR"
    echo "Please move this script into the 7B_records folder or 'cd' into it first."
    exit 1
fi

# 4. Create the Desktop Shortcut
echo "🖥️  Creating Desktop Shortcut..."
DESKTOP_FILE=~/Desktop/7B_Records.desktop

# Create the .desktop file content
# This version runs the server using node (production mode) after build
cat <<EOF > $DESKTOP_FILE
[Desktop Entry]
Name=7B Records
Comment=Synthwave Audio Broadcast Controller
Exec=lxterminal -e "bash -c 'cd $PROJECT_DIR && npm start; exec bash'"
Icon=multimedia-audio-player
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
EOF

# Make it executable
chmod +x $DESKTOP_FILE

echo "✅ Setup Complete!"
echo "-------------------------------------------------------"
echo "1. A '7B Records' icon has been created on your Desktop."
echo "2. Double-click the icon to start the server and interface."
echo "3. The app is optimized for your 800x480 screen."
echo "-------------------------------------------------------"
