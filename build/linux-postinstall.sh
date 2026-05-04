#!/bin/bash
# Post-install script for DWM Control deb package
# Runs as root via dpkg after installation
set -e

RULES_FILE="/etc/udev/rules.d/49-dwm-dfu.rules"

# Install udev rule for DWM V2 DFU device (VID_0483 PID_DF11 "DFU in FS Mode").
# TAG+="uaccess" grants the currently logged-in session user direct access via
# systemd-logind — no 'plugdev' group membership or re-login required on
# systemd-based systems (Debian 9+, Raspberry Pi OS Buster+).
cat > "$RULES_FILE" << 'EOF'
# DWM V2 DFU device — STM32 in DFU mode (VID 0483 PID DF11)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev", TAG+="uaccess"
EOF

chmod 644 "$RULES_FILE"

# Reload and trigger udev rules immediately so already-connected devices are covered
if command -v udevadm > /dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger --subsystem-match=usb 2>/dev/null || true
fi
