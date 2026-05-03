# 🎵 7B Records - Synthwave Broadcast Controller

A professional web dashboard for Raspberry Pi that enables streaming audio from a hardware input (like a record player or microphone) to Chromecast devices. Optimized for 800x480 touchscreens.

## 🚀 One-Step Setup (Raspberry Pi)

Run this single command in your terminal to install everything, build the app, and create a Desktop icon:

```bash
curl -sSL https://raw.githubusercontent.com/bsax94/7B-Records/main/setup_pi.sh | bash
```

*This script will:*
1. Install system dependencies (Icecast, DarkIce, Node.js, Chromium).
2. Clone the repository (if not already present).
3. Create standard config files (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`) if missing.
4. Install Node.js dependencies.
5. Build the production application.
6. **Create a "7B Records" icon on your Desktop.**

## 🔄 Updating & Fixing Errors
If you see **"Not a JSON response"** or **"0 chromecast devices"**, you need to sync the latest system files.

### The Easy Way (Run from anywhere)
If you followed the standard install, just run:
```bash
~/7B_records/update.sh
```
*(Or use `~/7B-Records/update.sh` depending on your folder name)*

### The Manual Way
Navigate to your folder and run the script:
```bash
cd ~/7B_records
chmod +x update.sh && ./update.sh
```
Then restart your server (or use the Desktop icon).

## 📡 Networking & Troubleshooting
1. **Network**: Ensure the Pi and the Speakers are on the **same Wi-Fi/LAN**.
2. **Logs**: If casting fails, click the **Terminal** icon in the app. You can click **"Download Full Log File"** to save a detailed report.
3. **Log Location**: The log file is stored on the Pi at: `~/7B_records/app.log`.
4. **Connector Error / DarkIce Exit**: If you see "Connector" errors in the logs, try changing the **Icecast Password** in settings from `raspberry` to `hackme`.
5. **Casting Issues**: If the app fails to cast, make sure `catt` is installed: `sudo apt install catt`.
6. **Firewall**: Ensure the following ports are open: **UDP 5353**, **TCP 8000**, **TCP 8008-8010**.

## 🛠 Features

*   **Cyberpunk UI**: Optimized for 800x480 Pi displays.
*   **Real-time Visualizer**: Watch your record's audio in motion.
*   **Chromecast Integration**: Seamlessly find and stream to your local speakers.
*   **Low Latency**: Uses DarkIce + Icecast for stable broadcasting.

## Usage

1.  **Open the App**: Double-click the "7B Records" icon on your Raspberry Pi desktop.
2.  **Input Selection**: Choose your USB Audio Interface from the list.
3.  **Target Speaker**: Select your Chromecast device.
4.  **Start Stream**: Hit the "Start Broadcast" button and drop the needle.

## Troubleshooting

*   **Icon not launching?** Right-click the icon and ensure "Mark as Executable" is checked.
*   **No sound?** Ensure your USB sound card is set as the default recording device in AlsaMixer.
*   **Chromecast missing?** Verify your Pi and Chromecast are on the same local network.
