@echo off
echo ========================================
echo DWM Control - Simple Setup and Run
echo ========================================
echo.

echo Step 1: Installing all dependencies...
npm install

if errorlevel 1 (
    echo ERROR: Failed to install dependencies!
    echo Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo Step 2: Starting the application...
npm run dev

echo.
echo Done!
pause
