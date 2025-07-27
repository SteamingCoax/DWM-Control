# Code Signing Setup Guide for DWM Control

## Overview
This guide will help you set up code signing for DWM Control across macOS, Windows, and Linux platforms to reduce the chances of security warnings.

## macOS Code Signing

### Prerequisites
1. **Apple Developer Account** (optional for self-signing)
2. **Xcode Command Line Tools**: `xcode-select --install`

### Self-Signing (Free)
```bash
# Create a self-signed certificate
security create-keypair -a rsa -s 2048 -f /tmp/dwm-control-key.pem -F /tmp/dwm-control-cert.pem

# Import into keychain (for Keychain Access method)
# Or use certificate from Keychain Access > Certificate Assistant > Create a Certificate
```

### Environment Variables for Signing
Create a `.env` file in your project root:
```bash
# macOS Signing
CSC_IDENTITY_AUTO_DISCOVERY=false
CSC_NAME="Your Certificate Name"
# Or for self-signed:
CSC_NAME="DWM Control Developer"

# For notarization (Apple Developer Account required)
APPLE_ID="your@email.com"
APPLE_ID_PASSWORD="app-specific-password"
APPLE_TEAM_ID="your-team-id"
```

### Steps to Create Self-Signed Certificate
1. Open **Keychain Access**
2. Go to **Certificate Assistant** > **Create a Certificate**
3. Name: "DWM Control Developer"
4. Identity Type: Self Signed Root
5. Certificate Type: Code Signing
6. Click Continue and Create

## Windows Code Signing

### Self-Signed Certificate
```bash
# Install Windows SDK or Visual Studio (for signtool.exe)
# Create self-signed certificate (PowerShell as Administrator)
New-SelfSignedCertificate -DnsName "DWM Control" -Type CodeSigning -CertStoreLocation cert:\CurrentUser\My

# Export certificate
$cert = Get-ChildItem -Path cert:\CurrentUser\My -CodeSigningCert
Export-Certificate -Cert $cert -FilePath "dwm-control-cert.cer"
Export-PfxCertificate -Cert $cert -FilePath "dwm-control-cert.pfx" -Password (ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText)
```

### Environment Variables for Windows
```bash
# Windows Signing
WIN_CSC_LINK="path/to/dwm-control-cert.pfx"
WIN_CSC_KEY_PASSWORD="YourPassword"
```

## Linux Code Signing

Linux uses GPG signing for packages:

### Create GPG Key
```bash
# Generate GPG key
gpg --gen-key

# Export public key
gpg --armor --export your@email.com > dwm-control-public.key

# Export private key (keep secure)
gpg --armor --export-secret-keys your@email.com > dwm-control-private.key
```

### Environment Variables for Linux
```bash
# Linux Signing
GPG_PRIVATE_KEY="path/to/dwm-control-private.key"
GPG_PASSPHRASE="your-gpg-passphrase"
```

## Complete .env File Template
```bash
# macOS
CSC_IDENTITY_AUTO_DISCOVERY=false
CSC_NAME="DWM Control Developer"
APPLE_ID="your@email.com"
APPLE_ID_PASSWORD="app-specific-password"
APPLE_TEAM_ID="your-team-id"

# Windows
WIN_CSC_LINK="build/certificates/dwm-control-cert.pfx"
WIN_CSC_KEY_PASSWORD="YourPassword"

# Linux
GPG_PRIVATE_KEY="build/certificates/dwm-control-private.key"
GPG_PASSPHRASE="your-gpg-passphrase"

# General
DEBUG=electron-builder
```

## Build Commands

### Build with Signing
```bash
# macOS only
./build.sh mac

# Windows only (from macOS with proper certificates)
./build.sh win

# Linux only
./build.sh linux

# All platforms
./build.sh all
```

### Verify Signatures

#### macOS
```bash
# Check signature
codesign -vvv --deep --strict dist/mac/DWM\ Control.app

# Check if notarized (if using Apple Developer Account)
spctl -a -vvv -t install dist/DWM\ Control-1.0.0.dmg
```

#### Windows
```bash
# Check signature (on Windows)
signtool verify /pa dist/DWM\ Control\ Setup\ 1.0.0.exe
```

#### Linux
```bash
# Check package signature
dpkg-sig --verify dist/dwm-control_1.0.0_amd64.deb
```

## Security Best Practices

1. **Keep certificates secure**: Store in a separate `build/certificates/` folder (add to .gitignore)
2. **Use environment variables**: Never commit passwords or keys to version control
3. **Regular updates**: Renew certificates before expiration
4. **Test installations**: Always test on clean systems
5. **Documentation**: Keep track of certificate expiration dates

## Troubleshooting

### Common Issues
- **"Developer cannot be verified"**: Users need to right-click > Open on first launch
- **Windows SmartScreen**: Self-signed apps will show warnings initially
- **Linux package managers**: May require importing GPG keys

### Solutions
- Provide clear installation instructions for users
- Consider purchasing code signing certificates for production
- Use consistent signing across all releases to build reputation
