# DWM-Control Build Notes

## Summary of Changes Made

### 1. Serial Terminal UI Improvements
- **White text**: Changed terminal text color to white for better visibility
- **No echo**: Disabled character echoing in the terminal input
- Files modified: `serial_terminal.py`

### 2. Control Panel Status Indicator
- Added connectivity status indicator at the top of the connection group
- Status shows "Connected" in green or "Disconnected" in red
- Matches the styling of the serial terminal status
- Files modified: `serial_gui.py`

### 3. Build System Setup
- Created platform-specific build scripts: `build_macos.py` and `build_windows.py`
- Scripts automatically detect and include:
  - dfu-util binaries from Programs/ folder
  - Icon files (.ico for Windows, .icns for macOS)
  - zadig-2.9.exe for Windows builds
- Use specific PyQt6 hidden imports instead of collect-all to avoid framework conflicts

### 4. Virtual Environment Resolution
- **Critical Discovery**: PyInstaller must be installed in the same virtual environment as the application
- Installed PyInstaller in `dwm_env` virtual environment to resolve PyQt6 import issues
- Build scripts now properly activate the virtual environment before running PyInstaller

### 5. dfu-util Binary Path Fix
- **Issue**: Packaged application couldn't find dfu-util binary, showing "dfu-util binary not found" error
- **Root Cause**: Code was looking for dfu-util in `Programs/dfu-util/` subfolder, but PyInstaller bundles it directly in the app bundle
- **Solution**: Modified `firmware_uploader.py` to check for bundled binary first, then fallback to original paths
- **Files Modified**: `firmware_uploader.py` - Updated path detection logic for packaged applications

## How to Build

### Prerequisites
Both platforms require a virtual environment with the necessary dependencies:

**Windows:**
```bash
# Create virtual environment (use 'venv' as the folder name for Windows)
python -m venv venv
venv\Scripts\activate.bat
pip install pyinstaller PyQt6 pyserial intelhex
```

**macOS/Linux:**
```bash
# Create virtual environment (can use 'dwm_env', 'venv', or '.venv')
python -m venv dwm_env  # or python -m venv venv
source dwm_env/bin/activate  # or source venv/bin/activate
pip install pyinstaller PyQt6 pyserial intelhex
```

### macOS
```bash
python build_macos.py
```
**Output**: `dist/DWM-Control.app` (app bundle)

### Windows
```bash
python build_windows.py
```
**Output**: `dist/DWM-Control.exe` (single executable)

Both scripts will:
1. Detect the virtual environment (dwm_env)
2. Find required binaries and icons automatically
3. Build with all dependencies included
4. Output will be in the `dist/` folder

## Requirements
- Virtual environment must be activated (supports: `venv`, `dwm_env`, `.venv`)
- PyInstaller must be installed in the virtual environment: `pip install pyinstaller`
- All dependencies (PyQt6, pyserial, etc.) in the virtual environment

## Key Technical Notes
- **macOS**: Uses `--onedir` mode for proper .app bundle creation (recommended by PyInstaller)
- **Windows**: Uses `--onefile` mode for single executable
- **PyQt6**: Uses specific hidden imports instead of `--collect-all=PyQt6` to avoid framework symlink conflicts
- **Code Signing**: macOS build may show signing warnings - safe to ignore for development/testing
- **Binary Bundling**: dfu-util binary is automatically included and found by the application at runtime
- **Virtual Environment**: Build scripts automatically detect common virtual environment names (`venv`, `dwm_env`, `.venv`)

## Files Created/Modified
- `serial_terminal.py` - UI improvements (white text, no echo)
- `serial_gui.py` - Status indicator addition
- `build_macos.py` - macOS build script with flexible virtual environment detection
- `build_windows.py` - Windows build script with flexible virtual environment detection  
- `firmware_uploader.py` - Fixed dfu-util binary path detection for packaged applications

## Testing
The built application has been tested and launches successfully with all PyQt6 dependencies properly included. All UI improvements (white terminal text, no echo, connectivity status) work correctly in the packaged application. The dfu-util binary is correctly bundled and found by the firmware uploader module.
