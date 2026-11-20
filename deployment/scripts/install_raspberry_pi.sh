#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo " VoxPi Personal AI Speech Intelligence - Raspberry Pi Setup "
echo " Target: Raspberry Pi OS (64-bit / ARM64)                   "
echo "============================================================"

sudo apt-get update
sudo apt-get install -y alsa-utils libasound2-dev portaudio19-dev sqlite3 ffmpeg curl

echo "[1/4] Verifying USB Microphone ALSA Enumeration..."
arecord -l || echo "Warning: No USB audio capture device detected yet. Continuing setup."

echo "[2/4] Creating persistent SQLite WAL data & backup directories..."
mkdir -p data backups

echo "[3/4] Installing application dependencies & building PWA bundle..."
npm install
npm run build

echo "[4/4] Registering systemd service for auto-recovery on boot..."
sudo cp deployment/systemd/voxpi-intelligence.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable voxpi-intelligence.service
sudo systemctl restart voxpi-intelligence.service

echo "VoxPi Speech Intelligence is running at http://$(hostname -I | awk '{print $1}'):3000"
