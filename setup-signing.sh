#!/bin/bash

# Quick setup script for code signing certificates
# This creates self-signed certificates for development/testing

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=================================="
echo "DWM Control - Code Signing Setup"
echo "=================================="

# Create certificates directory
mkdir -p build/certificates

# macOS Certificate Setup
if [[ "$OSTYPE" == "darwin"* ]]; then
    print_status "Setting up macOS code signing..."
    
    # Check if certificate already exists
    if security find-certificate -c "DWM Control Developer" >/dev/null 2>&1; then
        print_success "Certificate 'DWM Control Developer' already exists in keychain"
    else
        print_status "Creating self-signed certificate for macOS..."
        print_warning "This will open Keychain Access. Please:"
        print_warning "1. Choose 'Self Signed Root' as Identity Type"
        print_warning "2. Choose 'Code Signing' as Certificate Type"
        print_warning "3. Name it 'DWM Control Developer'"
        
        read -p "Press Enter to open Keychain Access Certificate Assistant..."
        open -b com.apple.KeychainAccess
        
        print_status "After creating the certificate, it will be automatically available for signing"
    fi
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "Creating .env file template..."
    cat > .env << 'EOF'
# macOS Code Signing
CSC_IDENTITY_AUTO_DISCOVERY=false
CSC_NAME="DWM Control Developer"

# Uncomment and fill these for Apple Developer Account notarization
# APPLE_ID="your@email.com"
# APPLE_ID_PASSWORD="app-specific-password"
# APPLE_TEAM_ID="your-team-id"

# Windows Code Signing (when building from Windows)
# WIN_CSC_LINK="build/certificates/dwm-control-cert.pfx"
# WIN_CSC_KEY_PASSWORD="YourPassword"

# Linux GPG Signing
# GPG_PRIVATE_KEY="build/certificates/dwm-control-private.key"
# GPG_PASSPHRASE="your-gpg-passphrase"

# Debug
DEBUG=electron-builder
EOF
    print_success "Created .env file template"
    print_warning "Please edit .env file with your actual certificate details"
else
    print_success ".env file already exists"
fi

# Add .env to .gitignore if not already there
if [ -f ".gitignore" ]; then
    if ! grep -q "\.env" .gitignore; then
        echo ".env" >> .gitignore
        print_status "Added .env to .gitignore"
    fi
else
    echo ".env" > .gitignore
    print_status "Created .gitignore with .env"
fi

# Add certificates directory to .gitignore
if ! grep -q "build/certificates" .gitignore 2>/dev/null; then
    echo "build/certificates/" >> .gitignore
    print_status "Added build/certificates/ to .gitignore"
fi

print_success "Code signing setup completed!"
echo ""
print_status "Next steps:"
echo "1. Edit the .env file with your certificate details"
echo "2. For Windows: Run the Windows certificate creation steps on a Windows machine"
echo "3. For Linux: Create GPG keys using the instructions in build/CODE_SIGNING_GUIDE.md"
echo "4. Run './build.sh mac' to test macOS building with signing"
echo ""
print_warning "For production releases, consider purchasing official code signing certificates"
