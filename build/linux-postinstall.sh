#!/bin/bash
# Post-install script for DWM Control deb package
# Runs as root via dpkg after installation
set -e

RULES_FILE="/etc/udev/rules.d/49-dwm-dfu.rules"

# Install udev rules so non-root users in the 'plugdev' group can access the DFU device
cat > "$RULES_FILE" << 'EOF'
# STM32 DFU mode — DWM V2 device (VID 0483 PID DF11)
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev", TAG+="uaccess"
EOF

chmod 644 "$RULES_FILE"

# Reload udev rules immediately (non-fatal if udevadm not available)
if command -v udevadm > /dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true
fi

echo ""
echo "DWM Control: USB device rules installed to $RULES_FILE"
echo ""
echo "ACTION REQUIRED: Add your user to the 'plugdev' group to access DFU devices:"
echo "  sudo usermod -aG plugdev \$USER"
echo "  (Then log out and back in)"
echo ""
