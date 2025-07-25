#!/bin/bash
# Diagnostic script for DWM-Control.app issues
# Run this if the app won't launch after signing

APP_PATH="dist/DWM-Control.app"

echo "🔍 DWM-Control.app Diagnostic Script"
echo "=" * 40

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Application not found at $APP_PATH"
    echo "   Please run 'python3 build_macos.py' first"
    exit 1
fi

echo "📁 Application structure:"
ls -la "$APP_PATH/Contents/"
echo ""

echo "📋 Info.plist check:"
if [ -f "$APP_PATH/Contents/Info.plist" ]; then
    echo "✅ Info.plist exists"
    echo "Bundle ID: $(defaults read "$APP_PATH/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || echo 'Not found')"
    echo "Executable: $(defaults read "$APP_PATH/Contents/Info.plist" CFBundleExecutable 2>/dev/null || echo 'Not found')"
else
    echo "❌ Info.plist missing"
fi
echo ""

echo "🔐 Code signing status:"
codesign --display --verbose "$APP_PATH" 2>&1
echo ""

echo "🔍 Signature verification:"
codesign --verify --verbose "$APP_PATH" 2>&1
echo ""

echo "🛡️  Security assessment:"
spctl --assess --type execute "$APP_PATH" 2>&1
echo ""

echo "🧪 Executable permissions:"
EXEC_PATH="$APP_PATH/Contents/MacOS/DWM-Control"
if [ -f "$EXEC_PATH" ]; then
    ls -la "$EXEC_PATH"
    echo "File type: $(file "$EXEC_PATH")"
else
    echo "❌ Main executable not found at $EXEC_PATH"
    echo "📂 MacOS directory contents:"
    ls -la "$APP_PATH/Contents/MacOS/" 2>/dev/null || echo "MacOS directory not found"
fi
echo ""

echo "📊 Extended attributes:"
xattr "$APP_PATH" 2>/dev/null || echo "No extended attributes"
echo ""

echo "🚀 Attempting to launch from command line:"
echo "Running: open '$APP_PATH'"
open "$APP_PATH" &
LAUNCH_PID=$!
sleep 2

# Check if process is running
if ps -p $LAUNCH_PID > /dev/null 2>&1; then
    echo "✅ Application launched successfully (PID: $LAUNCH_PID)"
else
    echo "❌ Application failed to launch or exited immediately"
    echo ""
    echo "📋 Recent system logs (last 10 relevant entries):"
    log show --predicate 'process CONTAINS "DWM-Control" OR message CONTAINS "DWM-Control"' --info --last 1m 2>/dev/null | tail -10 || echo "Unable to access system logs"
fi

echo ""
echo "💡 If the app still won't launch:"
echo "   1. Try launching from Finder (double-click)"
echo "   2. If blocked: Right-click → Open → Open"
echo "   3. Check Console.app for crash logs"
echo "   4. Try rebuilding without signing first"
