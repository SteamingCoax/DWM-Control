@echo off
REM Build script for DWM Control on Windows with code signing

echo ================================
echo DWM Control - Windows Build Script
echo ================================

cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo [INFO] Installing/updating dependencies...
npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

REM Clean previous builds
if exist "dist" (
    echo [INFO] Cleaning previous builds...
    rmdir /s /q dist
)

REM Build for Windows
echo [INFO] Building for Windows...
npm run build:win

if %errorlevel% equ 0 (
    echo [SUCCESS] Build completed successfully!
    echo.
    echo Generated files:
    if exist "dist" dir /b dist\*.exe dist\*.msi 2>nul
) else (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo Build process complete!
if exist "dist" (
    echo Built files are in the dist\ directory
    explorer dist
)

pause
