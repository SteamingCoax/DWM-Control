#!/bin/bash
# Post-remove script for the DWM Control deb package. Runs as root via dpkg.
#
# electron-builder uses this file INSTEAD of its default after-remove template,
# so the launcher-link removal from that template is reproduced here.
# ${executable} is filled in by electron-builder.

# Delete the command-line launcher link
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}' || true
else
    rm -f '/usr/bin/${executable}'
fi

# Remove the DWM Control udev rules
rm -f /etc/udev/rules.d/49-dwm.rules /etc/udev/rules.d/49-dwm-dfu.rules
if command -v udevadm >/dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
fi
