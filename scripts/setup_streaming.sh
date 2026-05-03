#!/bin/bash
# 7B Records - Streaming Service Configuration Script
# Configures Icecast2 and DarkIce for the 7B Records App

set -e

echo "🍦 [1/3] Setting up Icecast2 Server..."

# Install if missing
sudo apt update
sudo apt install -y icecast2 darkice

# Configuration files
ICECAST_CONFIG="/etc/icecast2/icecast.xml"
DEFAULT_PW="hackme"

echo "🔐 Configuring Icecast2 passwords (default: $DEFAULT_PW)..."

# Use sed to update passwords in the XML
sudo sed -i "s/<source-password>[^<]*<\/source-password>/<source-password>$DEFAULT_PW<\/source-password>/g" $ICECAST_CONFIG
sudo sed -i "s/<relay-password>[^<]*<\/relay-password>/<relay-password>$DEFAULT_PW<\/relay-password>/g" $ICECAST_CONFIG
sudo sed -i "s/<admin-user>[^<]*<\/admin-user>/<admin-user>admin<\/admin-user>/g" $ICECAST_CONFIG
sudo sed -i "s/<admin-password>[^<]*<\/admin-password>/<admin-password>$DEFAULT_PW<\/admin-password>/g" $ICECAST_CONFIG

# Broaden hostname to allow network discovery
echo "🌐 Optimizing network visibility..."
sudo sed -i 's/<hostname>[^<]*<\/hostname>/<hostname>0.0.0.0<\/hostname>/g' $ICECAST_CONFIG
sudo sed -i 's/127.0.0.1/0.0.0.0/g' $ICECAST_CONFIG

# Enable and start Icecast2
echo "🚀 Starting Icecast2 service..."
sudo systemctl enable icecast2
sudo systemctl restart icecast2

echo "🎙️ [2/3] Configuring DarkIce Permissions..."
# Ensure the current user can access audio hardware
sudo usermod -a -G audio $USER || true

# DarkIce usually runs as a process spawned by the Node server, 
# so we don't need to configure it as a systemd service, 
# but we do need it installed.

echo "✅ [3/3] Streaming Configuration Complete!"
echo "-------------------------------------------------------"
echo "Icecast Admin Panel: http://localhost:8000"
echo "Source Password:     $DEFAULT_PW"
echo "Mount Point:         /stream.mp3"
echo "-------------------------------------------------------"
