@echo off
REM Quick test script for DWM Control
REM This script directly runs the application with minimal setup

echo Starting DWM Control...

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Check if Electron is installed
if not exist "node_modules\.bin\electron.cmd" (
    echo Installing Electron...
    npm install electron --save-dev
    if errorlevel 1 (
        echo ERROR: Failed to install Electron!
        pause
        exit /b 1
    )
)

REM Start the app using npm script (safer than direct electron call)
echo Launching application...
npm run dev

if errorlevel 1 (
    echo.
    echo Application failed to start.
    echo Try running: test-app.bat for a more comprehensive setup
)

pause
