@echo off
echo ========================================
echo DWM Control - Fix and Test Script
echo ========================================
echo This script fixes native module issues and starts the app
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

echo Node.js found. Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not available!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo FIXING NATIVE MODULE COMPATIBILITY
echo ========================================
echo.

REM Option 1: Clean install approach
echo Step 1: Cleaning old installations...
if exist "node_modules" (
    echo Removing existing node_modules...
    rmdir /s /q node_modules
)

if exist "package-lock.json" (
    echo Removing package-lock.json...
    del package-lock.json
)

echo.
echo Step 2: Fresh installation of dependencies...
npm install

if errorlevel 1 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo Step 3: Installing electron-rebuild for native modules...
npm install --save-dev electron-rebuild

echo.
echo Step 4: Rebuilding native modules for Electron...
npx electron-rebuild

if errorlevel 1 (
    echo WARNING: electron-rebuild had issues. Trying force rebuild...
    npm rebuild
)

echo.
echo ========================================
echo STARTING APPLICATION
echo ========================================
echo.
echo Starting DWM Control application...
echo If you see the same error, press Ctrl+C and try the manual fix below.
echo.

npm run dev

if errorlevel 1 (
    echo.
    echo ========================================
    echo MANUAL FIX INSTRUCTIONS
    echo ========================================
    echo If the app still fails to start, try these commands manually:
    echo.
    echo 1. npm install --force
    echo 2. npx electron-rebuild --force
    echo 3. npm run dev
    echo.
    echo Alternative: Check if you're using the correct Node.js version
    echo Recommended: Node.js 18.x or 20.x LTS
    echo.
)

echo.
echo Application session ended.
pause
