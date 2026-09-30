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

### Settings
The Settings dialog provides centralized configuration across four tabs:
- **General**: Theme (Dark, Light, Ocean, Carbon, Amber)
- **Control**: Refresh rate, board layout, serial debug logging, auto-start polling on connect
- **Accessibility**: Spoken readouts, tuning tone, announcements, keyboard shortcuts
- **Updates**: Version info, "Accept beta (pre-release) updates" checkbox, manual update check

Open Settings from: the gear button in the title bar, the keyboard shortcut (Ctrl+, on Windows/Linux; Cmd+, on macOS), or the "Settings…" button above the meter board. Press Escape to close and return focus.

### Beta Updates
The Updates tab includes a checkbox to control whether the app offers beta (pre-release) versions. With "Accept beta updates" checked, the app offers pre-release versions as they are published. Unchecked, it ignores any newer beta and only installs stable releases. Until you adjust this setting, the checkbox reflects automatic behaviour: checked if the running version carries a pre-release suffix, otherwise unchecked.

### Accessibility
- **Screen readers**: NVDA on Windows, VoiceOver on macOS, and Orca on Linux all work without any configuration. The tab strip is a real tab list (use arrow keys to move between tabs). Each meter card is a named region, so NVDA users can press `D` to jump between meters. Each gauge exposes its current reading as text, the output console and upload log are live regions, and connection, range, firmware-upload and De-Embed results are announced automatically.
- **Spoken readouts** (off by default): The app can speak the focused meter's reading using the system voice at a configurable interval, when the value changes, or on demand. Settings live in the Settings dialog's Accessibility tab and include metric selection, interval, change threshold, voice, playback rate, and options to include the meter name and SWR data.
- **Tuning tone** (off by default): A continuous tone whose pitch follows the focused meter's power. By default, it ranges from 100 Hz at zero to 1 kHz at full scale; both ends are adjustable in the Settings dialog's Accessibility tab for flexible tuning of amplifiers by ear.
- **Keyboard shortcuts** (Ctrl+Shift on Windows and Linux, Cmd+Shift on macOS; all are also in the Accessibility menu): Shortcuts never fire while typing in a text field. NVDA users can use browse or focus mode as needed. On Linux, spoken readouts require `speech-dispatcher` to be installed (`sudo apt install speech-dispatcher` on Debian/Ubuntu). If the tone does not start after launch, press Ctrl+Shift+T once to restart it.

| Shortcut | Action |
| --- | --- |
| Ctrl+Shift+S | Toggle spoken readouts |
| Ctrl+Shift+T | Toggle tuning tone |
| Ctrl+Shift+R | Speak the focused meter's reading now |
| Ctrl+Shift+D | Describe the focused meter (name, element, range, full scale) |
| Ctrl+Shift+P | Peak hold on/off (latches the highest reading until turned off) |
| Ctrl+Shift+M | Cycle range 1x → 2x → 4x |
| Ctrl+Shift+A | Cycle readout metric (average → PEP → instantaneous → maximum) |
| Ctrl+Shift+Right / Left | Next / previous meter |
| Ctrl+Shift+1 … 8 | Jump to meter 1 … 8 |

### USB API Migration Note
- Outgoing control frames now default to `proto=2`.
- The app still accepts `proto=1` responses during the transition window, but that compatibility path is temporary.
- If a meter only speaks the original API, the app will fall back to `proto=1` per device automatically.
- When it falls back, the app translates the modern command names to the legacy v1 vocabulary automatically.
- Range values now use `1x`, `2x`, and `4x` in power responses, with config values mapped as `0 = 1x`, `1 = 2x`, and `2 = 4x`.

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
