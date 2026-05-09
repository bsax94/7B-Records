#!/bin/bash

# install.sh - 7B Records Full System Installer
# Purpose: Installs DarkIce, Icecast2, and dependencies for the 7B Records streaming stack.

APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

SOURCE_PASS="${1:-hackme}"
ADMIN_PASS="${2:-hackme}"

echo "============================================"
echo "    7B RECORDS SYSTEM INSTALLER v1.0       "
echo "============================================"

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Please run as root (use sudo)"
  exit 1
fi

echo "📦 1/4: Installing System Packages..."
apt-get update
apt-get install -y darkice icecast2 lame alsa-utils curl python3-pip python3-setuptools avahi-utils

echo "👥 Setting up User Permissions..."
# Add current user to audio and plugdev groups
if [ -n "$SUDO_USER" ]; then
    usermod -a -G audio,plugdev $SUDO_USER
    echo "Added $SUDO_USER to audio/plugdev groups."
fi
usermod -a -G audio,plugdev node 2>/dev/null || true

echo "📡 2/4: Configuring Icecast2 Server..."
# Run the existing icecast setup logic
CONFIG="/etc/icecast2/icecast.xml"
BACKUP="/etc/icecast2/icecast.xml.bak_$(date +%F_%T)"
cp $CONFIG $BACKUP

cat <<EOF > $CONFIG
<icecast>
    <location>7B Records Studio</location>
    <admin>admin@localhost</admin>
    <limits>
        <clients>100</clients>
        <sources>2</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65536</burst-size>
    </limits>
    <authentication>
        <source-password>$SOURCE_PASS</source-password>
        <relay-password>$SOURCE_PASS</relay-password>
        <admin-user>admin</admin-user>
        <admin-password>$ADMIN_PASS</admin-password>
    </authentication>
    <hostname>localhost</hostname>
    <listen-socket>
        <port>8000</port>
        <bind-address>0.0.0.0</bind-address>
    </listen-socket>
    <http-headers>
        <header name="Access-Control-Allow-Origin" value="*" />
    </http-headers>
    <mount type="normal">
        <mount-name>/stream.mp3</mount-name>
    </mount>
    <fileserve>1</fileserve>
    <paths>
        <basedir>/usr/share/icecast2</basedir>
        <logdir>/var/log/icecast2</logdir>
        <webroot>/usr/share/icecast2/web</webroot>
        <adminroot>/usr/share/icecast2/admin</adminroot>
        <alias source="/" destination="/status.xsl"/>
    </paths>
    <logging>
        <accesslog>access.log</accesslog>
        <errorlog>error.log</errorlog>
        <loglevel>3</loglevel>
    </logging>
</icecast>
EOF

# Enable and Start
sed -i 's/ENABLE=false/ENABLE=true/g' /etc/default/icecast2 || true
systemctl restart icecast2

echo "📺 3/4: Setting up Casting Engine (catt)..."
pip3 install catt --break-system-packages || pip3 install catt

echo "🎸 4/4: Hardware Check..."
echo "Detected Audio Devices:"
arecord -l | grep "card"

echo "🖥️  Checking for Desktop Environment..."
# Attempt to find the user's desktop
DESKTOP_DIR="/home/$SUDO_USER/Desktop"
if [ ! -d "$DESKTOP_DIR" ] && [ -d "/home/node/Desktop" ]; then
    DESKTOP_DIR="/home/node/Desktop"
fi

if [ -d "$DESKTOP_DIR" ]; then
    echo "[SETUP] Installing Desktop Shortcut to $DESKTOP_DIR"
    cp scripts/7B-Records.desktop "$DESKTOP_DIR/"
    # Adjust paths in the desktop file dynamically based on install location
    sed -i "s|/home/node/app|$APP_DIR|g" "$DESKTOP_DIR/7B-Records.desktop"
    chmod +x "$DESKTOP_DIR/7B-Records.desktop"
    echo "[SUCCESS] Desktop icon created."
else
    echo "[SKIP] No Desktop directory found. Skipping shortcut creation."
fi

chmod +x scripts/7b-launcher.sh

echo "============================================"
echo "🎊 INSTALLATION SUCCESSFUL!"
echo "============================================"
echo "Icecast Port   : 8000"
echo "Source Pass    : $SOURCE_PASS"
echo "Admin Pass     : $ADMIN_PASS"
echo "Mount Point    : /stream.mp3"
echo ""
echo "NEXT STEPS:"
echo "1. Ensure your Turntable is plugged in."
echo "2. Open the 7B Records Dashboard."
echo "3. Go to EXPERT SETTINGS (Gear Icon)."
echo "4. Update passwords to match the ones above."
echo "5. Click APPLY and START STREAMING."
echo "============================================"
