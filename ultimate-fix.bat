@echo off
echo ========================================
echo DEFINITIVE SerialPort Fix for Electron
echo ========================================
echo This will completely resolve the binding.node error
echo.

REM Stop any running processes that might lock files
taskkill /f /im electron.exe 2>nul
taskkill /f /im node.exe 2>nul

echo Step 1: Installing required build tools...
npm install --save-dev electron-rebuild

echo.
echo Step 2: Clearing npm cache...
npm cache clean --force

echo.
echo Step 3: Removing problematic native module...
if exist "node_modules\@serialport" (
    rmdir /s /q "node_modules\@serialport"
    echo Removed @serialport directory
)

echo.
echo Step 4: Reinstalling serialport specifically for Electron...
npm install serialport --force

echo.
echo Step 5: Rebuilding ALL native modules for Electron...
npx electron-rebuild --force

if errorlevel 1 (
    echo Rebuild failed. Trying alternative method...
    echo.
    
    echo Method 2: Using npm rebuild...
    npm rebuild
    
    if errorlevel 1 (
        echo Method 3: Manual serialport fix...
        npm uninstall serialport
        npm install serialport@latest
        npx electron-rebuild --module-dir . --which-module serialport
    )
)

echo.
echo Step 6: Verifying Electron installation...
if not exist "node_modules\.bin\electron.cmd" (
    echo Installing Electron...
    npm install electron --save-dev
)

echo.
echo ========================================
echo Testing the fix...
echo ========================================
echo Starting the application to test if the issue is resolved...
echo.

npm run dev

if errorlevel 1 (
    echo.
    echo ========================================
    echo ULTIMATE FIX - Complete Reinstall
    echo ========================================
    echo The issue persists. Let's do a complete clean reinstall.
    echo.
    echo Would you like to do a complete clean reinstall? [Y/N]
    set /p choice=
    if /i "%choice%"=="Y" (
        echo Removing all node modules...
        rmdir /s /q node_modules
        del package-lock.json 2>nul
        echo.
        echo Reinstalling everything...
        npm install
        echo.
        echo Rebuilding for Electron...
        npx electron-rebuild
        echo.
        echo Trying again...
        npm run dev
    )
)

echo.
echo Fix process completed.
pause
