# Code Signing Setup Guide

This document explains how to set up code signing for DWM-Control builds to reduce antivirus false positives.

# Code Signing Setup Guide

This document explains how to manually sign DWM-Control builds to reduce security warnings.

## macOS Manual Code Signing

The macOS build script creates an unsigned application that you can manually sign with your own certificate.

### Step 1: Create a Self-Signed Certificate

#### Using Keychain Access (Recommended):
1. Open **Keychain Access** application
2. Go to **Keychain Access** → **Certificate Assistant** → **Create a Certificate**
3. Fill in the details:
   - **Name**: `SteamingCoax`
   - **Identity Type**: `Self Signed Root`
   - **Certificate Type**: `Code Signing`
   - **Let me override defaults**: Check this box
4. Click **Continue** through the options (defaults are fine)
5. Set **Validity Period**: 3650 days (10 years)
6. **Keychain**: `login`
7. Click **Create**

#### Using Command Line (Alternative):
```bash
# Create the certificate
security create-certificate -n "SteamingCoax" -t codesign -c -k login.keychain

# Trust the certificate
security add-trusted-cert -d -r trustRoot -k login.keychain \
  $(security find-certificate -c "SteamingCoax" -p | security import)
```

### Step 2: Sign the Application

After building with `python3 build_macos.py`, run:

```bash
# Clean the bundle first (recommended)
dot_clean dist/DWM-Control.app
xattr -cr dist/DWM-Control.app

# Sign the application
codesign --sign "SteamingCoax" \
         --force \
         --timestamp \
         --options runtime \
         dist/DWM-Control.app

# Verify the signature
codesign --verify --verbose dist/DWM-Control.app

# Display signature details
codesign --display --verbose dist/DWM-Control.app
```

### Step 3: Test the Signed Application

```bash
# Check if the signature is valid
spctl --assess --type execute dist/DWM-Control.app

# If successful, you should see: "accepted"
```

## Windows Code Signing

Windows code signing requires the Windows SDK to be installed.

### Option 1: Install Windows SDK (Recommended)
1. Download and install the Windows SDK from:
   https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

2. Make sure to include the "Windows SDK Signing Tools for Desktop Apps" component

### Option 2: Install Visual Studio
1. Install Visual Studio with C++ development tools
2. This includes the Windows SDK components

### What the script does:
- Searches for `signtool.exe` in common SDK locations
- Creates temporary self-signed certificates if older SDK tools are available
- Signs the executable with SHA256 and timestamp verification
- Cleans up temporary certificate files after build

### Common signtool.exe locations:
- `C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe`
- `C:\Program Files (x86)\Windows Kits\10\bin\x86\signtool.exe`
- `C:\Program Files\Microsoft SDKs\Windows\v7.1\Bin\signtool.exe`

## Benefits of Code Signing

1. **Reduced False Positives**: Signed applications are less likely to trigger antivirus warnings
2. **User Trust**: Applications appear more legitimate to users and security software
3. **Windows SmartScreen**: Signed applications are less likely to trigger SmartScreen warnings
4. **macOS Gatekeeper**: Ad-hoc signed applications work better with Gatekeeper

## Troubleshooting

## Troubleshooting

### macOS Manual Signing Issues

#### Certificate Not Found
```bash
# List available certificates
security find-identity -v -p codesigning

# If "SteamingCoax" doesn't appear, recreate it using Keychain Access
```

#### "resource fork, Finder information, or similar detritus not allowed"
```bash
# Clean the bundle thoroughly
dot_clean dist/DWM-Control.app
xattr -cr dist/DWM-Control.app
find dist/DWM-Control.app -name ".DS_Store" -delete
find dist/DWM-Control.app -name "._*" -delete

# Then try signing again
codesign --sign "SteamingCoax" --force dist/DWM-Control.app
```

#### Permission Errors
- Make sure you have write access to the `dist/` directory
- Try running the signing command with the full path to the app

#### Signature Verification Fails
```bash
# Check what's wrong with the signature
codesign --verify --verbose=4 dist/DWM-Control.app

# If needed, remove existing signature and re-sign
codesign --remove-signature dist/DWM-Control.app
codesign --sign "SteamingCoax" --force dist/DWM-Control.app
```

### Windows Issues
- **"signtool not found"**: Install the Windows SDK as described above
- **Certificate creation fails**: This is normal if older SDK tools aren't available; the script will use default signing
- **Timestamp server errors**: The script uses DigiCert's timestamp server, which should be reliable

## Quick Reference Commands

### Complete Signing Workflow
```bash
# 1. Build the application
python3 build_macos.py

# 2. Clean and sign (one-liner)
dot_clean dist/DWM-Control.app && xattr -cr dist/DWM-Control.app && \
codesign --sign "SteamingCoax" --force --timestamp --options runtime dist/DWM-Control.app

# 3. Verify
codesign --verify --verbose dist/DWM-Control.app
```

### Alternative Certificate Names
If you prefer a different certificate name, replace "SteamingCoax" with your choice:
```bash
# Create with custom name
security create-certificate -n "YourName" -t codesign -c -k login.keychain

# Sign with custom name
codesign --sign "YourName" --force dist/DWM-Control.app
```

### For Distribution
If you have an Apple Developer certificate:
```bash
codesign --sign "Developer ID Application: Your Name (TEAM_ID)" \
         --timestamp --options runtime \
         dist/DWM-Control.app
```
