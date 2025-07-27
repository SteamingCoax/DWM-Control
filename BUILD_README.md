# DWM Control - Cross-Platform Build & Signing Guide

## Quick Start

### 1. Initial Setup (macOS)
```bash
# Install dependencies
npm install

# Setup code signing certificates
./setup-signing.sh

# Build for current platform (macOS)
./build.sh mac
```

### 2. Build for Specific Platforms

#### macOS (from macOS)
```bash
./build.sh mac
```

#### Windows (from macOS with cross-compilation)
```bash
./build.sh win
```

#### Linux (from macOS with cross-compilation)
```bash
./build.sh linux
```

#### All Platforms
```bash
./build.sh all
```

## Platform-Specific Setup

### macOS Setup
1. Run `./setup-signing.sh`
2. Create certificate in Keychain Access (opens automatically)
3. Name it "DWM Control Developer"
4. Edit `.env` file with certificate name

### Windows Setup (on Windows machine)
1. Run `setup-signing-windows.bat` as Administrator
2. Export certificate to `build/certificates/dwm-control-cert.pfx`
3. Update `.env` file with certificate path and password

### Linux Setup (any machine)
```bash
# Create GPG key
gpg --gen-key

# Export keys
gpg --armor --export your@email.com > build/certificates/dwm-control-public.key
gpg --armor --export-secret-keys your@email.com > build/certificates/dwm-control-private.key

# Update .env file
echo 'GPG_PRIVATE_KEY="build/certificates/dwm-control-private.key"' >> .env
echo 'GPG_PASSPHRASE="your-gpg-passphrase"' >> .env
```

## Build Outputs

### macOS
- `dist/DWM Control-1.0.0.dmg` - DMG installer
- `dist/DWM Control-1.0.0-mac.zip` - ZIP archive
- Supports both Intel (x64) and Apple Silicon (arm64)

### Windows
- `dist/DWM Control Setup 1.0.0.exe` - NSIS installer
- `dist/DWM Control 1.0.0.exe` - Portable executable
- Supports both 64-bit (x64) and 32-bit (ia32)

### Linux
- `dist/DWM Control-1.0.0.AppImage` - Universal AppImage
- `dist/dwm-control_1.0.0_amd64.deb` - Debian package
- `dist/dwm-control-1.0.0.x86_64.rpm` - RPM package

## Code Signing Benefits

### Self-Signed Certificates
- ✅ Prevents tampering detection
- ✅ Shows consistent publisher name
- ✅ Builds user trust over time
- ⚠️ Initial "unknown developer" warnings

### Purchased Certificates
- ✅ No security warnings
- ✅ Immediate user trust
- ✅ Required for automatic updates
- 💰 Annual cost ($100-400+)

## File Structure
```
DWM-Control/
├── build.sh                     # Main build script (macOS/Linux)
├── build-windows.bat            # Windows build script
├── setup-signing.sh             # macOS signing setup
├── setup-signing-windows.bat    # Windows signing setup
├── build/
│   ├── entitlements.mac.plist   # macOS security entitlements
│   ├── installer.nsh            # Windows installer customization
│   ├── background.png           # DMG background (auto-generated)
│   ├── certificates/            # Code signing certificates (gitignored)
│   └── CODE_SIGNING_GUIDE.md    # Detailed signing instructions
├── .env                         # Environment variables (gitignored)
└── dist/                        # Build outputs
```

## Environment Variables (.env file)

```bash
# macOS
CSC_IDENTITY_AUTO_DISCOVERY=false
CSC_NAME="DWM Control Developer"

# Apple Developer (optional, for notarization)
APPLE_ID="your@email.com"
APPLE_ID_PASSWORD="app-specific-password"
APPLE_TEAM_ID="your-team-id"

# Windows
WIN_CSC_LINK="build/certificates/dwm-control-cert.pfx"
WIN_CSC_KEY_PASSWORD="YourPassword"

# Linux
GPG_PRIVATE_KEY="build/certificates/dwm-control-private.key"
GPG_PASSPHRASE="your-gpg-passphrase"

# Debug
DEBUG=electron-builder
```

## Troubleshooting

### Common Build Issues

#### macOS: "No identity found"
```bash
# Check available certificates
security find-identity -v -p codesigning

# Verify certificate name in .env matches exactly
```

#### Windows: "Certificate not found"
```bash
# Verify certificate exists and path is correct
# Check .env file has correct WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD
```

#### Cross-Platform: "Platform not supported"
```bash
# Some native modules may not support cross-compilation
# Build on the target platform if needed
```

### User Installation Issues

#### macOS: "Developer cannot be verified"
- Right-click app → Open (first time only)
- Or: System Preferences → Security → Allow app

#### Windows: SmartScreen warning
- Click "More info" → "Run anyway"
- Self-signed apps show warnings initially

#### Linux: Package not trusted
```bash
# Import GPG key first
sudo apt-key add dwm-control-public.key
```

## Advanced Configuration

### Custom Icons
- macOS: Replace `assets/icon.icns`
- Windows: Replace `assets/icon.ico`
- Linux: Replace `assets/icon.png`

### Installer Customization
- Windows: Edit `build/installer.nsh`
- macOS: Modify DMG settings in `package.json`
- Linux: Update package metadata in `package.json`

## Security Best Practices

1. **Never commit certificates or private keys**
2. **Use strong passwords for certificate files**
3. **Store certificates in a secure location**
4. **Regularly update and renew certificates**
5. **Test installations on clean systems**
6. **Keep build environment secure**

## Support

For detailed code signing instructions, see `build/CODE_SIGNING_GUIDE.md`.

For build issues, check the electron-builder documentation:
https://www.electron.build/

---

**Note**: Self-signed certificates will show security warnings initially but provide protection against tampering and build user trust over time. For production releases, consider purchasing official code signing certificates.
