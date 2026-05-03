# PiCast Controller

A web dashboard for Raspberry Pi that enables streaming audio from a hardware input (like a record player or microphone) to Chromecast devices.

## How to Install on your Raspberry Pi

1.  **Clone this repository** to your Pi.
2.  **Install System Dependencies**:
    ```bash
    sudo apt update
    sudo apt install -y icecast2 darkice mkchromecast nodejs npm
    ```
    *Note: During Icecast2 installation, set the source password to `raspberry` (or your preferred password and update it in the dashboard).*
3.  **Install App Dependencies**:
    ```bash
    npm install
    ```
4.  **Build the Frontend**:
    ```bash
    npm run build
    ```
5.  **Run the Server**:
    ```bash
    # For development (includes mock data for non-Pi environments)
    npm run dev
    
    # For production
    npm start
    ```

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
