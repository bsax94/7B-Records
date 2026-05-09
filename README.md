# 🎵 7B Records - Synthwave Broadcast Controller

A professional web dashboard for Raspberry Pi that enables streaming audio from a hardware input (like a record player or microphone) to Chromecast devices. Optimized for 800x480 touchscreens.

## 🚀 Installation (Raspberry Pi)

### Method 1: The One-Step Installer (Recommended)
Run this single command in your terminal to install system dependencies, configure hardware, and create a Desktop icon:

```bash
curl -sSL https://raw.githubusercontent.com/bsax94/7B-Records/main/setup_pi.sh | bash
```

### Method 2: Manual Installation
If you have already cloned the repository:

1. **Run the System Installer**:
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh "YOUR_SOURCE_PASS" "YOUR_ADMIN_PASS"
   ```
   *Tip: Use 'hackme' if you don't want to change default settings.*

2. **Prepare the Application**:
   ```bash
   npm install
   npm run build
   ```

## 🔄 Updating & Maintenance

To update 7B Records to the latest version and fix common errors (like "Not a JSON response"), use the built-in update script:

```bash
sudo chmod +x update.sh
./update.sh
```

This will:
* Pull the latest code changes.
* Re-install and update Node.js dependencies.
* Re-generate production build files.
* Refresh the Desktop shortcut settings.

## 🎮 How to Launch

### Desktop shortcut
Double-click the **7B Records** icon on your Pi Desktop. This launches the `7b-launcher.sh` script which:
1. Verifies Icecast and DarkIce are ready.
2. Restarts the system services.
3. Automatically opens the dashboard in your browser.

### Terminal Launcher
```bash
./scripts/7b-launcher.sh
```

## 📡 Networking & Troubleshooting

1. **Local Network**: Ensure the Pi and the Chromecast device are on the **exact same Wi-Fi SSID**.
2. **Audio Group**: If DarkIce fails to start, ensure your user is in the audio group: `sudo usermod -a -G audio $USER` and reboot.
3. **Passwords**: Ensure the passwords in the Dashboard's **Expert Gear Settings** match the passwords used during `install.sh`. Default is `hackme`.
4. **Logs**: Use the **Terminal** icon in the dashboard to view real-time logs. If a cast fails, it will automatically attempt a fallback to `catt`.
5. **Firewall**: Open the following ports if necessary: **UDP 5353** (MDNS), **TCP 8000** (Icecast), **TCP 3000** (Dashboard).

## 🛠 Features

*   **Cyberpunk Vibe**: Neon-drenched UI optimized for 7" Raspberry Pi displays.
*   **Automatic Handshake**: DarkIce verifies connection to the Icecast bridge before attempting to cast.
*   **Dual-Engine Casting**: Primarily uses `mkchromecast`, with an automatic intelligent fallback to `catt` if errors are detected.
*   **System Integrity Check**: Launcher script ensures services are running before you start.
