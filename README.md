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
