#!/bin/bash

# 7B Records - Raspberry Pi Setup & Desktop Icon Script
echo "🎵 Starting 7B Records Setup for Raspberry Pi..."

# 1. Update and install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
# Try chromium-browser first, then chromium if it fails (common on newer Debian versions)
sudo apt install -y icecast2 darkice mkchromecast catt nodejs npm chromium-browser avahi-daemon avahi-utils libnss-mdns python3-pychromecast python3-flask libdbus-glib-1-dev libexiv2-dev || sudo apt install -y chromium catt avahi-daemon avahi-utils libnss-mdns python3-pychromecast python3-flask libdbus-glib-1-dev

# Ensure avahi-daemon is running (required for Chromecast discovery)
echo "📡 Enabling network discovery services..."
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon

# Open Firewall ports if ufw is present
if command -v ufw > /dev/null; then
    echo "🛡️  Configuring firewall for mDNS and streaming..."
    sudo ufw allow 5353/udp
    sudo ufw allow 8000/tcp
    sudo ufw allow 8008:8010/tcp
fi

# Ensure Icecast is listening on all interfaces (0.0.0.0) instead of just localhost
echo "🔧 Optimizing Icecast configuration for network casting..."
if [ -f "/etc/icecast2/icecast.xml" ]; then
    sudo sed -i 's/<bind-address>127.0.0.1<\/bind-address>/<bind-address>0.0.0.0<\/bind-address>/g' /etc/icecast2/icecast.xml
    sudo systemctl restart icecast2
fi

# 2. Setup the project folder
PROJECT_NAME="7B-Records"
REPO_URL="https://github.com/bsax94/7B-Records.git"

# Check if we are inside the project folder already
if [[ "$PWD" == *"$PROJECT_NAME"* ]]; then
    PROJECT_DIR=$(pwd)
else
    # If not, check if it exists in the current directory
    if [ -d "$PROJECT_NAME" ]; then
        cd "$PROJECT_NAME"
        PROJECT_DIR=$(pwd)
    else
        echo "📂 Cloning repository..."
        git clone $REPO_URL
        cd "$PROJECT_NAME"
        PROJECT_DIR=$(pwd)
    fi
fi

echo "📂 Working directory: $PROJECT_DIR"

# 3. Verify project integrity
echo "🚀 Verifying application files..."

if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the correct directory?"
    exit 1
fi

if [ ! -f "server.ts" ]; then
    echo "❌ Error: server.ts not found. Use 'git pull' to get the latest source."
    exit 1
fi

echo "📦 Running npm install..."
npm install
echo "🏗️  Building the application..."
npm run build

# 4. Create the Desktop Shortcut
echo "🖥️  Creating Desktop Shortcut..."
DESKTOP_FILE=~/Desktop/7B_Records.desktop
mkdir -p ~/Desktop

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
gio set $DESKTOP_FILE metadata::trusted true 2>/dev/null || true

echo "✅ Setup Complete!"
echo "-------------------------------------------------------"
echo "1. A '7B Records' icon has been created on your Desktop."
echo "2. Double-click the icon to start the server and interface."
echo "3. The app is optimized for your 800x480 screen."
echo "4. If the UI still gives 'Not a JSON response' errors,"
echo "   run: git pull && ./update.sh"
echo "-------------------------------------------------------"
