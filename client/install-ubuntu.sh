#!/usr/bin/env bash
# ==============================================================================
# UXI Sensor Clone - Ubuntu 24.04 / 26.04 LTS Installation Script
# Configures native tools, unmanages dedicated test interface, installs systemd
# ==============================================================================

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root (e.g. sudo bash client/install-ubuntu.sh)"
  exit 1
fi

echo "================================================================="
echo "   HPE Aruba UXI Sensor Clone - Ubuntu LTS Setup"
echo "================================================================="

# 1. Install Required Linux Networking Tools
echo "[1/4] Installing networking and diagnostic utilities..."
apt-get update -qq
apt-get install -y -qq \
  iw \
  wpasupplicant \
  isc-dhcp-client \
  iperf3 \
  mtr-tiny \
  tcpdump \
  dnsutils \
  curl \
  net-tools \
  ethtool \
  ca-certificates

# 2. Check or Install Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[2/4] Node.js not detected. Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
else
  echo "[2/4] Node.js already installed: $(node -v)"
fi

# 3. Configure NetworkManager / Netplan for Dedicated Test Radio
# By default, dedicated test adapter (e.g. wlan1) should be UNMANAGED so wpa_supplicant has sole control.
TEST_IFACE="${1:-wlan1}"
echo "[3/4] Configuring Netplan/NetworkManager to leave '${TEST_IFACE}' unmanaged..."

NM_CONF_DIR="/etc/NetworkManager/conf.d"
if [ -d "$NM_CONF_DIR" ]; then
  cat <<EOF > "$NM_CONF_DIR/99-uxi-unmanaged.conf"
[keyfile]
unmanaged-devices=interface-name:${TEST_IFACE}
EOF
  systemctl reload NetworkManager || true
  echo "      Configured $NM_CONF_DIR/99-uxi-unmanaged.conf"
fi

# 4. Install Systemd Service
INSTALL_DIR=$(pwd)
SERVER_URL="${2:-http://localhost:3000}"

echo "[4/4] Creating systemd service: /etc/systemd/system/uxi-sensor.service..."
cat <<EOF > /etc/systemd/system/uxi-sensor.service
[Unit]
Description=UXI Synthetic Network Sensor Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment="SERVER_URL=${SERVER_URL}"
Environment="TEST_INTERFACE=${TEST_IFACE}"
Environment="SENSOR_MODE=sensor"
ExecStart=$(which node) ${INSTALL_DIR}/client/bin/uxi-sensor
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo ""
echo "================================================================="
echo "[+] UXI Sensor successfully installed!"
echo "    Dedicated Test Interface : ${TEST_IFACE}"
echo "    Dashboard Server Target  : ${SERVER_URL}"
echo ""
echo "To start the sensor service:"
echo "  sudo systemctl start uxi-sensor"
echo "  sudo systemctl enable uxi-sensor"
echo "  sudo journalctl -u uxi-sensor -f"
echo "================================================================="
