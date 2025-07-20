# Windows DFU Driver Setup Guide

## Overview
For DWM-Control to communicate with DFU devices on Windows, a compatible USB driver must be installed. This guide explains the automated setup process and manual alternatives.

## Automated Driver Installation (Recommended)

DWM-Control includes built-in support for seamless driver installation on Windows:

### 🔄 **Automatic Detection**
- When you click "Refresh Devices" and no DFU devices are found
- DWM-Control automatically detects if this might be a driver issue
- Prompts you to install the required driver

### 🔧 **Manual Installation**
- Click the "Install Driver" button in the Firmware Uploader tab
- Available only on Windows systems
- Downloads and launches Zadig for driver installation

## What Happens During Installation

1. **Zadig Download**: DWM-Control downloads Zadig (trusted USB driver installer)
2. **Guided Setup**: Clear instructions are provided for the installation process
3. **Driver Installation**: Zadig installs the WinUSB driver for your DFU device
4. **Verification**: Return to DWM-Control and refresh devices

## Zadig Installation Steps

When Zadig launches, follow these steps:

1. **Enable All Devices**: Go to `Options → List All Devices`
2. **Select Device**: Choose your DFU device from the dropdown
3. **Choose Driver**: Ensure `WinUSB` is selected as the target driver
4. **Install**: Click `Install Driver` or `Replace Driver`
5. **Wait**: Allow installation to complete
6. **Return**: Close Zadig and refresh devices in DWM-Control

## Troubleshooting

### No Devices Appear in Zadig
- Ensure your device is connected and in DFU mode
- Try different USB ports
- Check device manager for unrecognized devices

### Driver Installation Fails
- Run DWM-Control as Administrator
- Disable Windows Driver Signature Enforcement temporarily
- Use Windows Device Manager to manually install drivers

### DFU-Util Still Can't Find Device
- Restart DWM-Control after driver installation
- Try reconnecting the DFU device
- Verify device is in DFU mode (not normal operation mode)

## Manual Driver Installation

If the automated process doesn't work:

1. Download Zadig from: https://zadig.akeo.ie/
2. Run Zadig as Administrator
3. Follow the steps outlined above
4. Restart DWM-Control

## Supported Devices

The driver installation supports common DFU device vendor IDs:
- `0483` (STMicroelectronics)
- `1209` (Generic)
- `16C0` (Van Ooijen Technische Informatica)

## Security Notes

- Zadig is downloaded from the official GitHub repository
- The executable is verified before use
- No drivers are installed without user consent
- Installation requires appropriate Windows permissions

## After Installation

Once the driver is installed:
- ✅ DFU devices will appear in the device list
- ✅ Firmware uploading will work seamlessly  
- ✅ No further driver installation needed
- ✅ Works across Windows reboots

The driver installation is a **one-time setup** - you won't need to repeat this process unless you change computers or reinstall Windows.
