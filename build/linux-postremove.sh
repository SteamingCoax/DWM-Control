#!/bin/bash
# Post-remove script for the DWM Control deb package. Runs as root via dpkg.
set -e
rm -f /etc/udev/rules.d/49-dwm.rules /etc/udev/rules.d/49-dwm-dfu.rules
if command -v udevadm > /dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
fi
