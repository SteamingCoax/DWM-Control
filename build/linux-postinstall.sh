#!/bin/bash
# Post-install script for the DWM Control deb package. Runs as root via dpkg.
#
# electron-builder uses this file INSTEAD of its default after-install template,
# so the default steps (launcher link, sandbox permissions, desktop database)
# are reproduced here before the DWM-specific udev rules are installed.
# ${executable} and ${sanitizedProductName} are filled in by electron-builder.

# --- Steps from electron-builder's default after-install.tpl -----------------

# Command-line launcher: /usr/bin/${executable} -> /opt/${sanitizedProductName}/${executable}
if type update-alternatives >/dev/null 2>&1; then
    # Remove a previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Use the SUID chrome-sandbox only on kernels without working user namespaces
if ! { [ -L /proc/self/ns/user ] && unshare --user true; } >/dev/null 2>&1; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# --- DWM Control: USB access to the meter -----------------------------------
# Lets the logged-in user talk to a DWM V2 without group changes or a re-login
# (TAG+="uaccess" via systemd-logind).

RULES_FILE="/etc/udev/rules.d/49-dwm.rules"
OLD_RULES_FILE="/etc/udev/rules.d/49-dwm-dfu.rules"   # written by releases <= 1.4.0-beta.1

cat > "$RULES_FILE" << 'EOF_RULES'
# DWM V2 meter, normal operation: USB CDC serial port. PID 5740 is ST's generic CDC PID
# (older firmware); PID A59C is the PID ST assigned to the DWM V2.
# Keep ModemManager from probing it, and let the logged-in user open /dev/ttyACM*.
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5740", ENV{ID_MM_DEVICE_IGNORE}="1"
SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5740", MODE="0664", GROUP="dialout", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="a59c", ENV{ID_MM_DEVICE_IGNORE}="1"
SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="a59c", MODE="0664", GROUP="dialout", TAG+="uaccess"
# DWM V2 meter in firmware-update (DFU) mode (VID 0483 PID DF11).
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev", TAG+="uaccess"
EOF_RULES
chmod 644 "$RULES_FILE"
rm -f "$OLD_RULES_FILE"

# Apply immediately so an already-connected meter is covered without a replug.
if command -v udevadm >/dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger --subsystem-match=usb --subsystem-match=tty 2>/dev/null || true
fi
