@echo off
echo ========================================
echo DWM Control - Launch Options
echo ========================================
echo.
echo Choose how to run the application:
echo.
echo 1. Normal mode (with hardware acceleration)
echo 2. Safe mode (GPU acceleration disabled)
echo 3. Auto-detect (tries normal, falls back to safe)
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo Starting in NORMAL mode...
    echo Hardware acceleration: ENABLED
    npm run dev
) else if "%choice%"=="2" (
    echo.
    echo Starting in SAFE mode...
    echo Hardware acceleration: DISABLED
    npm run dev:safe
) else if "%choice%"=="3" (
    echo.
    echo Starting with AUTO-DETECT...
    test-app.bat
) else (
    echo Invalid choice. Starting in normal mode...
    npm run dev
)

echo.
pause
