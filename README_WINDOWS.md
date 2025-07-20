# DWM-Control - Windows Setup Guide

## 🚀 Quick Start for Windows Users

### Option 1: Automatic Setup (Recommended)
1. **Download Python** (if not installed):
   - Visit https://python.org/downloads/
   - Download Python 3.8 or higher
   - ⚠️ **IMPORTANT**: Check "Add Python to PATH" during installation

2. **Run Setup**:
   - Double-click `setup_windows.bat`
   - Follow the on-screen instructions
   - The script will set up everything automatically

3. **Launch Application**:
   - **For daily use**: Double-click `start.bat` (smart launcher)
   - **For instant launch**: Double-click `launch.bat` (fastest)
   - **For detailed output**: Run `run_windows.bat`

### Option 2: Manual Setup
1. Open Command Prompt in the DWM-Control folder
2. Run: `python -m venv venv`
3. Run: `venv\Scripts\activate.bat`
4. Run: `pip install -r requirements.txt`
5. Run: `python DWM-Control.py`

## 📁 Windows Script Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `setup_windows.bat` | First-time setup | Run once to set up everything |
| `start.bat` | Smart launcher | Double-click to run app (checks dependencies) |
| `launch.bat` | Super fast launcher | When everything is set up (instant launch) |
| `run_quick.bat` | Quick launcher | Fast launch with minimal setup |
| `run_windows.bat` | Full launcher with diagnostics | When you need detailed output or troubleshooting |
| `run_windows.ps1` | PowerShell version | If you prefer PowerShell |
| `cleanup_windows.bat` | Environment reset | When virtual environment is corrupted |
| `diagnose_venv.bat` | Environment diagnostics | When having virtual environment issues |

## 🔧 Driver Installation (For DFU Devices)

DWM-Control includes automatic driver installation for Windows:

1. **Automatic Detection**: When no DFU devices are found, the app will offer to install drivers
2. **Manual Installation**: Click "Install Driver" button in the Firmware Uploader tab
3. **Process**: The app downloads and launches Zadig to install WinUSB drivers
4. **One-time Setup**: Once installed, drivers work permanently

### Manual Driver Installation
If automatic installation doesn't work:
1. Download Zadig from: https://zadig.akeo.ie/
2. Run as Administrator
3. Go to Options → List All Devices
4. Select your DFU device
5. Choose WinUSB as target driver
6. Click "Install Driver"

## 🛠️ Prerequisites

### Required
- **Python 3.8+**: Download from https://python.org
- **pip**: Usually included with Python
- **Internet connection**: For package installation

### Optional (for firmware upload)
- **dfu-util**: Auto-installed via Python packages, or download from http://dfu-util.sourceforge.net/
- **WinUSB driver**: Auto-installed via Zadig when needed

## 📦 Package Installation Methods

### Option A: Package Managers (Recommended)
```batch
# Chocolatey
choco install python dfu-util

# Scoop  
scoop install python dfu-util
```

### Option B: Manual Installation
1. Python: https://python.org/downloads/
2. dfu-util: http://dfu-util.sourceforge.net/

## 🔍 Troubleshooting

### Python Not Found
- Ensure Python is installed and added to PATH
- Restart Command Prompt after Python installation
- Try running: `py --version` instead of `python --version`

### Permission Errors
- Run Command Prompt as Administrator
- Check Windows antivirus isn't blocking the scripts
- Ensure you have write permissions in the folder

### Virtual Environment Issues
**Error: `'venv\Scripts\activate.bat' is not recognized...`**
- The virtual environment is corrupted
- **Solution 1**: Run `cleanup_windows.bat` to reset environment
- **Solution 2**: Delete the `venv` folder and run setup again
- **Prevention**: Don't interrupt setup scripts while running

**Error: `No module named pip` in virtual environment**
- pip is not installed in the virtual environment
- **Solution 1**: Run `diagnose_venv.bat` for detailed diagnosis and fix
- **Solution 2**: Run `cleanup_windows.bat` to recreate environment
- **Solution 3**: Updated setup scripts automatically handle this issue

### Package Installation Fails
- Check internet connection
- Try running: `python -m pip install --upgrade pip`
- Use: `pip install --user -r requirements.txt`

### DFU Device Not Found
- Install WinUSB driver using Zadig (app will guide you)
- Check device is in DFU mode
- Try different USB ports
- Check Windows Device Manager for unrecognized devices

### Application Won't Start
- Check all Python packages are installed: `pip list`
- Try running from Command Prompt to see error messages
- Ensure no other applications are using the same serial ports

## 🏃‍♀️ Running the Application

### Launcher Options (Choose Your Speed)

#### 🚀 **Super Fast** - `launch.bat`
```batch
# Instant launch (assumes everything is set up)
launch.bat
```
- Fastest startup time
- No dependency checking
- Best for daily use when environment is stable

#### 🧠 **Smart Launch** - `start.bat`
```batch
# Intelligent launcher with quick dependency check
start.bat
```
- Fast startup with safety checks
- Automatically fixes common issues
- Installs missing packages if needed
- **Recommended for most users**

#### ⚡ **Quick Setup** - `run_quick.bat`
```batch
# Fast launch with minimal setup
run_quick.bat
```
- Minimal environment setup
- Quick package check and installation
- Good balance of speed and reliability

#### 🔧 **Full Diagnostics** - `run_windows.bat`
```batch
# Detailed output and comprehensive checks
run_windows.bat

# For verbose output including dfu-util check:
run_windows.bat --verbose
```
- Complete environment validation
- Detailed error messages and troubleshooting
- Package update checks (only when needed)
- Use when troubleshooting issues

### Method 1: Double-click (Easiest)
- Double-click `start.bat`

### Method 2: Command Line (More control)
```batch
# Navigate to folder
cd path\to\DWM-Control

# Run the launcher
run_windows.bat

# Or activate environment and run directly
venv\Scripts\activate.bat
python DWM-Control.py
```

### Method 3: PowerShell
```powershell
# You may need to enable script execution first:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then run:
.\run_windows.ps1
```

## 🔄 Updating

To update DWM-Control:
1. Download new version
2. Copy your existing `venv` folder to the new location (optional)
3. Run `setup_windows.bat` again to update packages

## 💡 Tips for Windows Users

1. **Pin to Taskbar**: Right-click `start.bat` → Send to → Desktop, then pin the shortcut
2. **Run as Admin**: Some driver operations may require administrator privileges
3. **Antivirus**: Add DWM-Control folder to antivirus exclusions if needed
4. **Firewall**: Allow Python through Windows Firewall when prompted
5. **Updates**: Windows may require periodic driver updates for new devices

## 📞 Getting Help

If you encounter issues:
1. Run `run_windows.bat` to see detailed error messages
2. Check the Windows-specific sections in the main README
3. Verify all prerequisites are properly installed
4. Try running setup again with administrator privileges

---

**Windows Version Compatibility:**
- ✅ Windows 10 (recommended)
- ✅ Windows 11 (recommended)  
- ⚠️ Windows 8.1 (may work with limitations)
- ❌ Windows 7 (not supported - Python 3.8+ requirement)
