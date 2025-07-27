@echo off
echo ========================================
echo Quick Fix for SerialPort Native Module
echo ========================================
echo.

echo This script will fix the serialport binding error you encountered.
echo.

REM Install electron-rebuild if not present
echo Installing electron-rebuild...
npm install --save-dev electron-rebuild

echo.
echo Rebuilding native modules for Electron...
npx electron-rebuild

if errorlevel 1 (
    echo Rebuild failed. Trying alternative approaches...
    echo.
    echo Method 1: Force rebuild specific module
    npm rebuild @serialport/bindings-cpp --update-binary
    echo.
    echo Method 2: Reinstall serialport
    npm uninstall serialport
    npm install serialport
    echo.
    echo Method 3: Final rebuild attempt
    npx electron-rebuild --force
)

echo.
echo Fix completed! Now try running the app again:
echo npm run dev
echo.
pause
