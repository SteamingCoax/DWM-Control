#!/bin/bash
# Post-install script for the DWM Control deb package. Runs as root via dpkg.
# Installs the udev rules that let the logged-in user talk to a DWM V2 meter
# without group changes or a re-login (TAG+="uaccess" via systemd-logind).
set -e

RULES_FILE="/etc/udev/rules.d/49-dwm.rules"
OLD_RULES_FILE="/etc/udev/rules.d/49-dwm-dfu.rules"   # written by releases <= 1.4.0-beta.1

cat > "$RULES_FILE" << 'EOF_RULES'
# DWM V2 meter, normal operation: STM32 USB CDC serial port (VID 0483 PID 5740).
# Keep ModemManager from probing it, and let the logged-in user open /dev/ttyACM*.
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5740", ENV{ID_MM_DEVICE_IGNORE}="1"
SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5740", MODE="0664", GROUP="dialout", TAG+="uaccess"
# DWM V2 meter in firmware-update (DFU) mode (VID 0483 PID DF11).
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev", TAG+="uaccess"
EOF_RULES
chmod 644 "$RULES_FILE"
rm -f "$OLD_RULES_FILE"

# Apply immediately so an already-connected meter is covered without a replug.
if command -v udevadm > /dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger --subsystem-match=usb --subsystem-match=tty 2>/dev/null || true
fi
