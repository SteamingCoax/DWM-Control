@echo off
echo ========================================
echo DWM Control - ULTRA SAFE MODE
echo ========================================
echo Starting with maximum GPU disabling for problematic systems
echo.

REM Start with all possible GPU-disabling flags
npx electron . --disable-gpu --disable-gpu-compositing --disable-gpu-rasterization --disable-gpu-sandbox --disable-software-rasterizer --no-sandbox --disable-accelerated-2d-canvas --disable-accelerated-jpeg-decoding --disable-accelerated-mjpeg-decode --disable-accelerated-video-decode --disable-features=VizDisplayCompositor

if errorlevel 1 (
    echo.
    echo Even ultra-safe mode failed. This suggests a deeper issue.
    echo Possible causes:
    echo 1. Missing dependencies
    echo 2. Code syntax errors
    echo 3. Network drive permissions
    echo.
    echo Try copying project to C:\Projects\DWM-Control
)

echo.
pause
