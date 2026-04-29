# DWM Control

DWM Control is a cross-platform desktop app for DWM V2 device workflows.

It provides:
- Firmware upload to DFU devices
- Device control and monitoring
- De-Embed analysis tools
- In-app update checking and installation

Supported platforms:
- macOS
- Windows
- Linux

## What New Users Should Do First

1. Install the latest release for your platform from GitHub Releases.
2. Connect your device.
3. Open the Firmware Upload tab.
4. Click Refresh to detect DFU devices.
5. Choose firmware and upload.

## Main Features

### Firmware Upload
- Detects connected DFU devices
- Supports Intel HEX firmware files
- Lets you either:
  - Download the latest firmware, or
  - Select a local HEX file
- Shows upload progress and output logs

### Control Tab
- Device controls are generated dynamically for supported hardware
- Includes live device discovery and interaction workflow

### De-Embed Tab
- Power and unit configuration
- Measurement and sampling helpers
- Polynomial regression workflow for analysis

### In-App Updates
- Header button lets users check for updates manually
- If an update is available, users can download and install from the app
- If already up to date, the app shows a confirmation notification

## Installation

Download the release asset matching your OS:
- macOS Intel: DMG
- macOS Apple Silicon: ZIP
- Windows: Setup EXE
- Linux: AppImage or DEB

## Usage Guide

### Firmware Upload Workflow

1. Open Firmware Upload.
2. Click Refresh in Device Selection.
3. Select a detected DFU device.
4. Provide firmware:
   - Download Latest Firmware, or
   - Choose Local File and select a HEX file
5. Click Upload Firmware.
6. Watch Upload Output for status and completion.

### Checking for App Updates

1. Click Check Updates in the header.
2. If update is available:
   - Confirm download when prompted
   - Confirm restart when download completes
3. If no update is available:
   - You will see an Up to Date notification

## Troubleshooting

### DFU Device Not Found
- Confirm USB cable supports data (not charge-only).
- Reconnect device and click Refresh again.
- Ensure device is in DFU mode.
- On Windows, use Launch Zadig from Firmware Upload when shown, then install the correct driver.

### Firmware Upload Fails
- Verify the selected file is a valid HEX firmware file.
- Re-check selected DFU target.
- Retry after disconnecting and reconnecting the device.

### Update Check Fails
- Check internet connectivity.
- Retry after a short delay.
- If running in development mode, real update checks are intentionally disabled.

## Development Setup

Prerequisites:
- Node.js 20+
- npm

Install and run:

1. Install dependencies
   npm install

2. Run app in development
   npm start

Optional development run commands:
- npm run dev
- npm run dev:safe
- npm run dev:no-gpu

## Build Commands

From repository root:

- Build current platform
  npm run build

- Build macOS
  npm run build:mac

- Build unsigned macOS
  npm run build:mac:unsigned

- Build Windows
  npm run build:win

- Build Linux
  npm run build:linux

- Build all targets
  npm run build:all

Build outputs are written to dist.

## Release and Publishing

Recommended one-command publish flow:

npm run release:publish -- 1.2.3

This will:
- Update package version
- Commit release version bump
- Create and push git tag
- Create release entry if missing
- Trigger GitHub Actions build and upload pipeline

Internal maintainer checklist is available in:
- .internal/release-reference.md

## Project Structure

- main.js: Electron main process and native integrations
- preload.js: Secure IPC bridge for renderer
- renderer.js: Main renderer application logic
- renderer/modules/extensions.js: UI extension methods (including updater UI logic)
- index.html: App layout and tabs
- styles.css: Main UI styling
- styles-control.css: Additional control-specific styling
- Programs: Bundled binary resources including DFU tooling

## License

MIT
