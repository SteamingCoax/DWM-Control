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

REM Rebuild native modules for Electron
echo Rebuilding native modules for Electron compatibility...
echo This ensures serialport and other native modules work correctly.
echo.

REM First, ensure electron-rebuild is installed
npm install --save-dev electron-rebuild >nul 2>&1

REM Try rebuilding native modules
npx electron-rebuild --force
if errorlevel 1 (
    echo WARNING: electron-rebuild failed. Trying alternative methods...
    echo.
    echo Method 1: Rebuilding serialport specifically...
    npm rebuild @serialport/bindings-cpp --update-binary
    if errorlevel 1 (
        echo Method 2: Reinstalling serialport...
        npm uninstall serialport
        npm install serialport
        npx electron-rebuild --force
        if errorlevel 1 (
            echo WARNING: Automatic fix failed.
            echo.
            echo To fix manually, run: ultimate-fix.bat
            echo Or try: 
            echo   1. Delete node_modules folder
            echo   2. Run: npm install
            echo   3. Run: npx electron-rebuild
            echo.
        ) else (
            echo Native modules rebuilt successfully!
            echo.
        )
    ) else (
        echo SerialPort rebuilt successfully!
        echo.
    )
) else (
    echo Native modules rebuilt successfully!
    echo.
)

echo Starting DWM Control application in development mode...
echo.
echo Note: Will try hardware acceleration first. If GPU errors occur,
echo the app will show how to restart in safe mode.
echo.
echo Press Ctrl+C in this window to stop the application.
echo Close the Electron window to exit normally.
echo ========================================
echo.

REM Start the application using the dev script
npm run dev

if errorlevel 1 (
    echo.
    echo ========================================
    echo App failed to start. Trying safe mode...
    echo ========================================
    echo.
    
    echo Starting without GPU acceleration...
    npm run dev:safe
    
    if errorlevel 1 (
        echo.
        echo Both normal and safe mode failed.
        echo Check the error messages above for troubleshooting.
    )
)

echo.
echo Application has been closed.
pause
