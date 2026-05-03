#!/bin/bash

# 7B Records - Raspberry Pi Setup & Desktop Icon Script
echo "🎵 Starting 7B Records Setup for Raspberry Pi..."

# 1. Update and install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
# Try chromium-browser first, then chromium if it fails (common on newer Debian versions)
sudo apt install -y icecast2 darkice mkchromecast nodejs npm chromium-browser avahi-daemon avahi-utils libnss-mdns python3-pychromecast python3-flask libdbus-glib-1-dev libexiv2-dev python3-pip || \
sudo apt install -y chromium avahi-daemon avahi-utils libnss-mdns python3-pychromecast python3-flask libdbus-glib-1-dev python3-pip

# Ensure .local/bin is in PATH for current and future sessions (for catt)
if ! echo "$PATH" | grep -q ".local/bin"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    export PATH="$HOME/.local/bin:$PATH"
fi

# Specialized catt installation for PEP 668 (externally-managed-environment)
install_catt() {
    if ! command -v catt &> /dev/null && ! [ -f "$HOME/.local/bin/catt" ]; then
        echo "📦 Installing 'catt'..."
        sudo apt install -y catt || \
        pip3 install catt --break-system-packages --user || \
        pip3 install catt --user || \
        echo "⚠️  Could not install catt via standard methods."
    fi
}

install_catt

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

# 2. Setup the project folder
PROJECT_NAME="7B-Records"
REPO_URL="https://github.com/bsax94/7B-Records.git"

if [[ "$PWD" == *"$PROJECT_NAME"* ]]; then
    echo "📍 Already in project directory."
    git pull || echo "⚠️  Could not pull latest changes."
else
    if [ -d "$PROJECT_NAME" ]; then
        cd "$PROJECT_NAME"
        git pull || echo "⚠️  Could not pull latest changes."
    else
        echo "📂 Cloning repository..."
        git clone "$REPO_URL"
        cd "$PROJECT_NAME"
    fi
fi
PROJECT_DIR=$(pwd)

# Specialized setup for Streaming Services (Icecast2 & DarkIce)
# Now that we are in the repo, the script is available
if [ -f "scripts/setup_streaming.sh" ]; then
    chmod +x scripts/setup_streaming.sh
    ./scripts/setup_streaming.sh
fi

echo "📂 Working directory: $PROJECT_DIR"

# 3. Verify project integrity
echo "🚀 Verifying application files..."

# Ensure core scripts are executable
chmod +x setup_pi.sh update.sh scripts/setup_streaming.sh 2>/dev/null || true

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
Exec=lxterminal -e bash -c "cd '$PROJECT_DIR' && npm start; exec bash"
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
echo "1. Project Directory: $(pwd)"
echo "2. A '7B Records' icon has been created on your Desktop."
echo "3. Double-click the icon to start the server."
echo "4. Or manually start: npm start"
echo "5. Interface: http://localhost:3000"
echo "-------------------------------------------------------"
