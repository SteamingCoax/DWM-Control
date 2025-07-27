@echo off
REM Quick test script for DWM Control
REM This script directly runs the application with minimal setup

echo Starting DWM Control...

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Start the app directly with Electron
echo Launching application...
npx electron .

pause
