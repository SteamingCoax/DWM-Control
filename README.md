# DWM-Control

A comprehensive development tool for DWM devices with firmware upload, serial terminal, and control panel capabilities. Built with PyQt6 for a modern, cross-platform GUI experience.

## Features

### Firmware Uploader Tab
- DFU device detection and selection
- Hex file validation and conversion
- Firmware upload to STM32G0B0RET devices
- Real-time upload progress and status
- Support for 512KB flash memory limit

### Serial Terminal Tab
- USB serial port detection and connection
- Configurable baud rates (9600 to 921600)
- **Terminal-like interface**: Type commands directly in the terminal
- Real-time serial data display
- **Live command input**: Character-by-character transmission
- Clear terminal functionality

### Control Panel Tab
- **GUI-based serial control**: Organized parameter tabs for device control
- **Parameter management**: Read/write device parameters by category
- **Action commands**: Reset, reboot, save, calibrate, and more
- **Real-time status**: Communication log and device responses
- **Organized interface**: Tabbed parameters for Device, Measurement, Trigger, etc.

## Project Structure

```
DWM-Control/
├── DWM-Control.py          # Main application entry point (PyQt6)
├── firmware_uploader.py   # Firmware uploader tab module (PyQt6)
├── serial_terminal.py     # Serial terminal tab module (PyQt6)
├── serial_gui.py          # Control panel tab module (PyQt6)
├── requirements.txt       # Python dependencies (includes PyQt6)
├── install_dependencies.sh # Installation script
└── README.md              # This file
```

## Requirements

- Python 3.8+
- PyQt6 (for modern GUI)
- dfu-util (for firmware uploads)
- pyserial (for serial communication)
- intelhex (for hex file processing)

## Installation

### Option 1: Quick Install (Recommended)
Run the installation script:
```bash
./install_dependencies.sh
```

### Option 2: Manual Install
1. Install Python dependencies:
```bash
pip3 install -r requirements.txt
```

2. Install PyQt6 (if not included above):
```bash
pip3 install PyQt6
```

3. Install dfu-util:
   - **macOS**: `brew install dfu-util`
   - **Ubuntu/Debian**: `sudo apt-get install dfu-util`
   - **Windows**: Download from https://dfu-util.sourceforge.net/

## Usage

Run the application:
```bash
python3 DWM-Control.py
```

### Firmware Upload
1. Select the "Firmware Uploader" tab
2. Click "Refresh Devices" to detect DFU devices
3. Select a .hex file using "Select .hex File"
4. Click "Upload Firmware" to start the upload process
5. Monitor progress in the output window

### Serial Terminal
1. Select the "Serial Terminal" tab
2. Choose your serial port and baud rate
3. Click "Connect" to establish connection
4. **Type commands directly in the terminal** - characters are sent in real-time
5. Press Enter to send line commands
6. View incoming data in real-time
7. Use "Clear Terminal" to clear the display

### Control Panel
1. Select the "Control Panel" tab
2. Choose your serial port and baud rate
3. Click "Connect" to establish connection
4. Use the organized parameter tabs:
   - **Device**: Basic device configuration
   - **Measurement**: Measurement settings
   - **Trigger**: Trigger configuration
   - **Termination**: Termination settings
   - **Element**: Element configuration
   - **Display**: Display settings
   - **Supply**: Supply configuration
   - **Logging**: Logging settings
5. Use "Set" and "Get" buttons for individual parameters
6. Use action buttons for device commands (Reset, Save, Calibrate, etc.)
7. Monitor communication status in the status window

## PyQt6 Features

- **Modern GUI**: Native look and feel on all platforms
- **Responsive Interface**: Smooth resizing and layout management
- **Threaded Operations**: Non-blocking serial communication and file operations
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Backspace Protection**: Cannot delete beyond the current input area

## Control Panel Features

- **Button Controls**: Easy-to-use buttons for common commands
- **Real-time Data**: Live display of sensor readings and device status
- **Command Log**: Timestamped log of all sent commands and received data
- **Status Monitoring**: Visual connection status and device information

## Data Protocol

The Control Panel expects data in the format:
```
voltage: 3.3
status: OK
```

Commands sent to the device:
- `RESET` - Reset the device
- `REBOOT` - Reboot the device
- `VERSION` - Get device version
- `START_STREAM` / `STOP_STREAM` - Control data streaming

## Notes

- The application automatically handles hex file validation and conversion
- Serial connections are automatically closed when switching tabs
- All operations are performed in separate threads to maintain UI responsiveness
- The terminal behaves like a traditional terminal emulator with protected input/output areas
- The control panel provides a user-friendly interface for device interaction
- Each tab operates independently with its own serial connection 