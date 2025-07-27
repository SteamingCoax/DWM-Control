@echo off
echo ========================================
echo SerialPort Alternative Fix
echo ========================================
echo This tries different approaches to fix the binding issue
echo.

echo Method 1: Using specific Node.js ABI version...
npm install --save-dev node-gyp
npm config set target_platform win32
npm config set target_arch x64
npm config set cache_min 999999999

echo.
echo Method 2: Installing Windows build tools...
echo (This may prompt for admin rights)
npm install --global windows-build-tools

echo.
echo Method 3: Force rebuild with specific settings...
npm rebuild --verbose @serialport/bindings-cpp

echo.
echo Method 4: Installing prebuilt binaries...
npm install @serialport/bindings-cpp --force

echo.
echo Method 5: Alternative serialport installation...
npm uninstall serialport
npm install serialport@10.5.0

echo.
echo Method 6: Final electron rebuild...
npx electron-rebuild --verbose

echo.
echo Testing application...
npm run dev

pause
