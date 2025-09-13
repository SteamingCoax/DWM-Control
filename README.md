# DWM Control - Electron Version

A cross-platform application for DWM V2 firmware updating and device control, built with Electron.

## Features

- **Firmware Uploader**: Upload Intel HEX firmware files to DFU-compatible devices
- **Serial Terminal**: Communicate with devices via serial port
- **Control Panel**: Send predefined commands and control device functions
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Modern UI**: Dark theme with professional styling

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- DFU-util binary (included in Programs folder)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Run in development mode:
```bash
npm run dev
```

3. Start with Electron Forge:
```bash
npm start
```

### Building

#### Package for current platform:
```bash
npm run package
```

#### Create distributables:
```bash
npm run make
```

#### Build with electron-builder:
```bash
npm run build
```

## Application Structure

```
Electron/
├── main.js           # Main process
├── preload.js        # Preload script for secure IPC
├── renderer.js       # Renderer process logic
├── index.html        # Main UI
├── styles.css        # Application styles
├── assets/           # Icons and resources
└── package.json      # Dependencies and scripts
```

## Key Differences from Python Version

1. **No Malware Flags**: Electron apps are not typically flagged by antivirus software
2. **Better Distribution**: Standard installers for each platform
3. **Modern UI**: Hardware-accelerated, responsive interface
4. **Cross-Platform**: Single codebase for all platforms
5. **Professional**: Industry-standard application framework

## Dependencies

- **Electron**: Application framework
- **SerialPort**: Serial communication
- **Intel-HEX**: Firmware file parsing
- **Electron Forge**: Build tooling

## Usage

1. **Firmware Upload**:
   - Click "Refresh Devices" to scan for DFU devices
   - Select a .hex firmware file
   - Click "Upload Firmware"

2. **Serial Terminal**:
   - Select a serial port and baud rate
   - Click "Connect"
   - Send commands via the terminal

3. **Control Panel**:
   - Use predefined buttons for common commands
   - Send custom parameters
   - Monitor device status

## License

MIT License - See main project LICENSE file.
