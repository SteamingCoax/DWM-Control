# Auto-Update System Guide

## Overview
DWM Control now includes a seamless auto-update system that allows users to update the application without manually downloading and installing new versions.

## How It Works

### For Users
1. **Automatic Checks**: The app automatically checks for updates when it starts
2. **Visual Notification**: When an update is available, an orange "Update Available" button appears in the header
3. **One-Click Download**: Click the button to download the update in the background
4. **Easy Installation**: Once downloaded, click "Restart to Update" to install and restart

### For Developers
1. **GitHub Releases**: Updates are distributed through GitHub releases
2. **Automatic Distribution**: electron-builder handles uploading release assets
3. **Seamless Process**: Users get updates without visiting the GitHub page

## Features
- ✅ **Background Downloads**: Updates download without interrupting work
- ✅ **Progress Indication**: Shows download progress in the UI
- ✅ **Safe Installation**: Only installs when user clicks "Restart to Update"
- ✅ **Error Handling**: Graceful handling of network issues or update failures
- ✅ **Manual Check**: Users can manually check for updates using the 🔍 button
- ✅ **Non-Intrusive**: Updates don't force immediate installation

## Release Process

### 1. Update Version
Edit `package.json` and increment the version number:
```json
{
  "version": "1.0.1"
}
```

### 2. Build for Distribution
```bash
# Build for all platforms
npm run build:all

# Or build for specific platforms
npm run build:mac     # macOS only
npm run build:win     # Windows only
npm run build:linux   # Linux only
```

### 3. Create GitHub Release
1. Go to https://github.com/SteamingCoax/DWM-Control/releases
2. Click "Create a new release"
3. Create a new tag (e.g., `v1.0.1`)
4. Upload the files from the `dist/` folder:
   - **macOS**: `DWM Control-1.0.1.dmg` and `DWM Control-1.0.1-mac.zip`
   - **Windows**: `DWM Control Setup 1.0.1.exe` and `DWM Control Portable 1.0.1.exe`
   - **Linux**: `DWM Control-1.0.1.AppImage`, `.deb`, and `.rpm` files
5. Write release notes describing the changes
6. Publish the release

### 4. Automatic Updates
Once the release is published:
- Users will automatically be notified of the update
- They can download and install with one click
- No manual download required!

## Development vs Production

### Development Mode
- Auto-updater is disabled during development (`npm run dev`)
- This prevents update notifications while testing

### Production Mode
- Auto-updater is active in packaged applications
- Checks for updates on startup and every few hours
- Shows update notifications when available

## Manual Update Check
Users can manually check for updates by clicking the 🔍 button in the header, next to the theme toggle.

## Troubleshooting

### Updates Not Showing
1. Ensure the application is packaged (not running via `npm run dev`)
2. Check internet connection
3. Verify the GitHub repository has newer releases
4. Check the console for error messages

### Download Failures
1. Check network connectivity
2. Verify GitHub releases are properly uploaded
3. Try the manual update check button
4. Restart the application

### Installation Issues
1. Ensure the application has write permissions
2. Close any antivirus software temporarily
3. Run as administrator (Windows) if needed
4. Check disk space availability

## Configuration
The auto-updater is configured in:
- `package.json`: Publishing configuration
- `main.js`: Auto-updater event handlers
- `preload.js`: IPC API exposure
- `renderer.js`: UI handling and user interaction

## GitHub Token (For CI/CD)
If you plan to automate releases, you'll need a GitHub token with `repo` permissions. Set it as an environment variable:
```bash
export GH_TOKEN=your_github_token_here
```

Then use the publish commands:
```bash
npm run publish:all  # Publishes to GitHub automatically
```

## Security
- Updates are verified against GitHub's SSL certificates
- Only signed releases from the official repository are accepted
- Users can always verify the source by checking the GitHub releases page
