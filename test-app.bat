@echo off
echo ========================================
echo DWM Control - Development Test Script
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if npm is available
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not available!
    echo Please ensure Node.js is properly installed.
    echo.
    pause
    exit /b 1
)

echo Node.js and npm are available.
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo node_modules folder not found. Installing dependencies...
    echo This may take a few minutes...
    echo.
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
) else (
    echo Dependencies already installed.
    echo.
)

REM Check if Electron is available locally
if not exist "node_modules\.bin\electron.cmd" (
    echo Electron not found in local dependencies.
    echo Installing Electron...
    npm install electron --save-dev
    if errorlevel 1 (
        echo ERROR: Failed to install Electron!
        echo.
        pause
        exit /b 1
    )
)

echo Starting DWM Control application in development mode...
echo.
echo Press Ctrl+C in this window to stop the application.
echo Close the Electron window to exit normally.
echo ========================================
echo.

REM Start the application using the dev script
npm run dev

echo.
echo Application has been closed.
pause
