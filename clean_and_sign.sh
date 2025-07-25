#!/bin/bash
# Clean and Sign Script for DWM-Control.app
# Run this after building with build_macos.py

APP_PATH="dist/DWM-Control.app"
CERT_NAME="SteamingCoax"

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Application not found at $APP_PATH"
    echo "   Please run 'python3 build_macos.py' first"
    exit 1
fi

echo "🧹 Cleaning the application bundle..."

# Clean the bundle thoroughly
dot_clean "$APP_PATH"
xattr -cr "$APP_PATH"
find "$APP_PATH" -name ".DS_Store" -delete
find "$APP_PATH" -name "._*" -delete
find "$APP_PATH" -name ".AppleDouble" -type d -exec rm -rf {} + 2>/dev/null || true
find "$APP_PATH" -name "__MACOSX" -type d -exec rm -rf {} + 2>/dev/null || true

# Remove any existing signatures first
echo "🗑️  Removing any existing signatures..."
codesign --remove-signature "$APP_PATH" 2>/dev/null || true

echo "🔏 Signing the application..."

# Sign without hardened runtime first (more compatible)
codesign --sign "$CERT_NAME" --force "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Successfully signed the application"
    
    echo "🔍 Verifying signature..."
    codesign --verify --verbose "$APP_PATH"
    
    if [ $? -eq 0 ]; then
        echo "✅ Signature verification passed"
        echo "📋 Signature details:"
        codesign --display --verbose "$APP_PATH"
        
        echo ""
        echo "🧪 Testing application launch..."
        # Test if the app can be launched
        spctl --assess --type execute "$APP_PATH" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ Application passes security assessment"
        else
            echo "⚠️  Application may show security warnings on first launch"
            echo "   This is normal for self-signed applications"
        fi
        
        echo ""
        echo "🚀 To launch the application:"
        echo "   Double-click on dist/DWM-Control.app"
        echo "   If blocked: Right-click → Open → Open"
        
    else
        echo "⚠️  Signature verification failed"
        echo "🔧 Trying alternative signing without hardened runtime..."
        codesign --remove-signature "$APP_PATH" 2>/dev/null || true
        codesign --sign "$CERT_NAME" --force "$APP_PATH"
        
        if [ $? -eq 0 ]; then
            echo "✅ Alternative signing successful"
        else
            echo "❌ All signing attempts failed"
        fi
    fi
else
    echo "❌ Code signing failed"
    echo ""
    echo "💡 Make sure you have created the '$CERT_NAME' certificate:"
    echo "   1. Open Keychain Access"
    echo "   2. Certificate Assistant → Create a Certificate"
    echo "   3. Name: '$CERT_NAME'"
    echo "   4. Identity Type: Self Signed Root"
    echo "   5. Certificate Type: Code Signing"
    echo "   6. Let me override defaults: Yes"
    echo "   7. Set validity period and save to login keychain"
    echo ""
    echo "🔍 Available certificates:"
    security find-identity -v -p codesigning | grep -E "(SteamingCoax|Valid|Policy)"
fi
