# PiCast Controller

A web dashboard for Raspberry Pi that enables streaming audio from a hardware input (like a record player or microphone) to Chromecast devices.

## How to Install on your Raspberry Pi

1.  **Clone this repository** to your Pi.
2.  # 1. Create the robust setup script
cat <<'EOF' > ~/setup_7b_records.sh
#!/bin/bash
echo "🎵 Starting 7B Records Professional Setup..."

# Install system tools
sudo apt update
sudo apt install -y icecast2 darkice mkchromecast nodejs npm chromium-browser || sudo apt install -y chromium


# Force create the correct package.json
cat <<EOP > package.json
{
  "name": "7b-records",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "node server.ts",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@google/genai": "^1.30.2",
    "@tailwindcss/vite": "^4.0.0",
    "express": "^4.21.2",
    "lucide-react": "^0.479.0",
    "motion": "^12.4.10",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
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
    "tsx": "^4.19.3",
    "typescript": "^5.8.2"
  }
}
EOP

# Install and Build
npm install
npm run build

# Create Desktop Shortcut
DESKTOP_FILE=~/Desktop/7B_Records.desktop
cat <<EOD > $DESKTOP_FILE
[Desktop Entry]
Name=7B Records
Comment=Synthwave Audio Broadcast Controller
Exec=lxterminal -e "bash -c 'cd ~/7B_records && npm start; exec bash'"
Icon=multimedia-audio-player
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
EOD
chmod +x $DESKTOP_FILE

echo "✅ Setup Complete. Check your Desktop for the 7B Records icon!"
EOF

# 2. Make it executable and run it
chmod +x ~/setup_7b_records.sh
~/setup_7b_records.sh

## Usage

1.  Open `http://<your-pi-ip>:3000` in any browser.
2.  Select your **Audio Input Device** (usually a USB sound card).
3.  Choose your **Target Chromecast** from the list.
4.  Click **Start Broadcast**.
5.  Watch the console for logs. Note that there is typically a 2-5 second latency due to network encoding.

## Troubleshooting

*   **No devices found:** Ensure your USB sound card is plugged in before starting the app. Run `arecord -l` to verify the OS sees it.
*   **Chromecast not listed:** Ensure your Pi and Chromecast are on the same 2.4GHz/5GHz WiFi network.
*   **Permission Error:** The app uses `sudo` to run `darkice`. Ensure the user running the app has sudo privileges.
