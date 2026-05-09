#!/bin/bash
# 7B Records System Launcher
# Verifies settings and starts the streaming engine

APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$APP_DIR"

echo "--- 7B RECORDS BOOT SEQUENCE ---"

# 1. Verify Icecast Configuration
if [ ! -f "/etc/icecast2/icecast.xml" ]; then
    echo "[ERROR] Icecast2 not installed or config missing."
    exit 1
fi

# 2. Check Permissions
if ! groups | grep -q "audio"; then
    echo "[WARNING] User not in audio group. DarkIce might fail."
fi

# 3. Ensure Icecast is running
echo "[BOOT] Starting/Restarting Icecast2..."
sudo systemctl restart icecast2

# 4. Launch the Web Application
echo "[BOOT] Starting 7B Records Server..."
# We run npm start if available, otherwise node server.ts
if [ -f "package.json" ]; then
    npm start &
else
    node server.ts &
fi

# 5. Open the Dashboard in Default Browser
echo "[BOOT] Opening Dashboard..."
sleep 5
xdg-open http://localhost:3000 || chromium-browser http://localhost:3000 || firefox http://localhost:3000 &

echo "--- BOOT COMPLETE ---"
echo "Keep this window open to see server logs."
