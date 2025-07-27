@echo off
echo ========================================
echo System Diagnostics
echo ========================================
echo.

echo Node.js version:
node --version

echo.
echo npm version:
npm --version

echo.
echo Current directory:
cd

echo.
echo Checking if this is a network drive (Z:)...
if "%CD:~0,2%"=="Z:" (
    echo WARNING: You are on a network drive Z:
    echo This can cause issues with native modules!
    echo.
    echo SOLUTION: Copy the project to a local drive like C:
    echo Example: C:\Projects\DWM-Control
    echo.
) else (
    echo Local drive detected - good!
)

echo.
echo Checking Electron version in package.json...
if exist package.json (
    findstr "electron" package.json
) else (
    echo package.json not found
)

echo.
echo Checking if Python is available (needed for native builds):
python --version 2>nul
if errorlevel 1 (
    echo Python not found - this might be the issue!
    echo Native modules need Python to compile.
    echo.
    echo SOLUTION: Install Python from https://python.org
    echo Or install Visual Studio Build Tools
)

echo.
echo Architecture check:
echo PROCESSOR_ARCHITECTURE=%PROCESSOR_ARCHITECTURE%

pause
