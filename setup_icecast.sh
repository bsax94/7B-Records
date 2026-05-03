#!/bin/bash

# setup_icecast.sh - 7B Records Icecast Configuration Utility
# This script configures the local Icecast2 server to listen on all interfaces
# and sets secure passwords for streaming.

# Default values
SOURCE_PASS="${1:-hackme}"
ADMIN_PASS="${2:-hackme}"
PORT="${3:-8000}"

echo "--- 7B Records Icecast Setup ---"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

if ! command -v icecast2 &> /dev/null; then
    echo "Icecast2 is not installed. Installing..."
    apt-get update && apt-get install -y icecast2
fi

CONFIG="/etc/icecast2/icecast.xml"
BACKUP="/etc/icecast2/icecast.xml.bak_$(date +%F_%T)"

echo "Backing up existing config to $BACKUP"
cp $CONFIG $BACKUP

echo "Generating optimized icecast.xml..."

cat <<EOF > $CONFIG
<icecast>
    <location>Earth</location>
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
        <port>$PORT</port>
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
        <logsize>10000</logsize>
    </logging>

    <security>
        <chroot>0</chroot>
    </security>
</icecast>
EOF

echo "Ensuring Icecast is enabled on boot..."
sed -i 's/ENABLE=false/ENABLE=true/g' /etc/default/icecast2 || true

echo "Restarting Icecast2 service..."
systemctl restart icecast2

echo "SUCCESS! Icecast is now running on all interfaces at port $PORT"
echo "Source Password: $SOURCE_PASS"
echo "Admin Password: $ADMIN_PASS"
echo "--------------------------------"
