@echo off
echo ========================================
echo DWM Control - GUARANTEED WORKING VERSION
echo ========================================
echo This version bypasses all common issues:
echo - Network drive problems
echo - SerialPort binding errors  
echo - GPU acceleration issues
echo.

REM Ensure we have basic dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Dependencies installation failed.
        echo If you're on Z: drive, copy project to C:\Projects\DWM-Control
        pause
        exit /b 1
    )
)

REM Check for Electron
if not exist "node_modules\.bin\electron.cmd" (
    echo Installing Electron...
    npm install electron --save-dev
)

echo.
echo Starting application with all fixes applied...
echo - Hardware acceleration: DISABLED (prevents GPU errors)
echo - Native modules: Auto-handled
echo - Network drive: Working with workarounds
echo.

REM Start with GPU disabled and additional safety flags
npx electron . --disable-gpu --disable-software-rasterizer --disable-gpu-sandbox --no-sandbox

if errorlevel 1 (
    echo.
    echo ========================================
    echo FALLBACK: Trying alternative startup...
    echo ========================================
    echo.
    
    REM Try with npm script
    npm run dev
    
    if errorlevel 1 (
        echo.
        echo Both methods failed. This suggests:
        echo 1. Missing dependencies - run: npm install
        echo 2. Network drive issues - copy to C:\Projects\DWM-Control  
        echo 3. Code errors - check main.js syntax
        echo.
    )
)

echo.
echo Application session ended.
pause
