# Testing DWM Control Application

This directory contains several scripts to help you test the DWM Control application without building it.

## Windows Testing Scripts

### Option 1: Full Test Script (Recommended)
```bash
test-app.bat
```
- Comprehensive script with error checking
- Automatically installs dependencies if needed
- Provides detailed feedback during execution
- Works with Command Prompt

### Option 2: Quick Test Script
```bash
quick-test.bat
```
- Minimal, fast execution
- Good for quick testing after dependencies are installed
- Works with Command Prompt

### Option 3: PowerShell Script
```powershell
test-app.ps1
```
- Enhanced PowerShell version with colored output
- Better error handling and user feedback
- Run in PowerShell with: `.\test-app.ps1`

## Prerequisites

1. **Node.js** - Download from [nodejs.org](https://nodejs.org/)
   - Includes npm (Node Package Manager)
   - Version 16.x or higher recommended

2. **Git** (optional) - For cloning the repository

## Quick Start

1. Open Command Prompt or PowerShell
2. Navigate to the project directory
3. Run one of the test scripts:
   ```bash
   # Command Prompt
   test-app.bat
   
   # Or quick version
   quick-test.bat
   
   # PowerShell
   .\test-app.ps1
   ```

## Manual Testing (Alternative)

If you prefer to run commands manually:

```bash
# Install dependencies (first time only)
npm install

# Start the application
npm run dev
```

## Troubleshooting

### "Node.js not found"
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Restart your terminal after installation
- Verify with: `node --version`

### "npm install fails"
- Check your internet connection
- Try running as administrator
- Clear npm cache: `npm cache clean --force`

### "Electron fails to start"
- Ensure all dependencies installed: `npm install`
- Try: `npm install electron --save-dev`
- Check if antivirus is blocking Electron

### "SerialPort/Native Module Errors" ⚠️ COMMON ISSUE
If you see errors like:
```
Error: bindings.node is not a valid Win32 application
```

**Quick Fix:**
1. Run the fix script: `quick-fix.bat`
2. Or manually: `npm run rebuild`

**Alternative Solutions:**
```bash
# Method 1: Use the comprehensive fix script
fix-and-test.bat

# Method 2: Manual rebuild
npm install --save-dev electron-rebuild
npx electron-rebuild

# Method 3: Clean reinstall
npm cache clean --force
rmdir /s /q node_modules
del package-lock.json
npm install
```

**Why this happens:** Native modules (like serialport) are compiled for specific Node.js versions. Electron uses a different Node.js version than your system, so these modules need to be rebuilt for Electron compatibility.

## Features Available in Development Mode

- **Hot reload** - Changes to HTML/CSS/JS are reflected immediately
- **Developer tools** - Press F12 or Ctrl+Shift+I
- **Console debugging** - All console.log outputs visible
- **File watching** - Application restarts on main process changes

## Development vs Production

- **Development mode**: Uses `npm run dev` - faster startup, debugging enabled
- **Production build**: Uses `npm run build` - optimized, packaged executable

The test scripts run in development mode for faster iteration and debugging.
