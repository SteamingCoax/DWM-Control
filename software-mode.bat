@echo off
echo ========================================
echo DWM Control - Software Rendering Mode
echo ========================================
echo This mode completely bypasses GPU and uses CPU rendering only
echo.

echo Starting with software rendering...
set ELECTRON_DISABLE_GPU=1
set ELECTRON_NO_HARDWARE_ACCELERATION=1

npx electron . --disable-gpu --disable-gpu-compositing --disable-gpu-rasterization --disable-gpu-sandbox --disable-software-rasterizer --no-sandbox --disable-hardware-acceleration --force-cpu-draw

echo.
echo Software rendering mode completed.
pause
