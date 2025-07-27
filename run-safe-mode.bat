@echo off
echo ========================================
echo DWM Control - GPU Safe Mode
echo ========================================
echo Starting application with GPU acceleration disabled
echo This fixes GPU process launch errors
echo.

REM Start Electron with disabled GPU acceleration
echo Launching application in safe graphics mode...
npx electron . --disable-gpu --disable-software-rasterizer --disable-gpu-sandbox

if errorlevel 1 (
    echo.
    echo Application failed to start even in safe mode.
    echo Try running: temp-disable-serialport.bat
)

echo.
echo Application closed.
pause
