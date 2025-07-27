@echo off
REM Simple DFU Debug Test for Windows

echo === DFU DEBUGGING SCRIPT (SIMPLE) ===
echo Date: %date% %time%
echo Platform: Windows
echo Working Directory: %cd%
echo.

REM Test 1: Check if dfu-util exists
echo 1. Checking for dfu-util...
if exist "Programs\dfu-util\dfu-util.exe" (
    echo ✓ dfu-util found in Programs\dfu-util\
    Programs\dfu-util\dfu-util.exe --version
    set DFUUTIL_CMD=Programs\dfu-util\dfu-util.exe
) else (
    echo ✗ dfu-util.exe not found in Programs\dfu-util\!
    echo Please ensure dfu-util.exe exists in Programs\dfu-util\
    pause
    exit /b 1
)
echo.

REM Test 2: List DFU devices
echo 2. Scanning for DFU devices...
echo Command: %DFUUTIL_CMD% -l
echo.
%DFUUTIL_CMD% -l
set EXIT_CODE=%errorlevel%
echo.
echo Exit code: %EXIT_CODE%
echo.

REM Test 3: Check for DFU devices in output
echo 3. Quick check for DFU devices...
%DFUUTIL_CMD% -l 2>&1 | findstr /C:"Found DFU" > nul
if %errorlevel% == 0 (
    echo ✓ DFU devices detected!
    echo DFU device lines:
    %DFUUTIL_CMD% -l 2>&1 | findstr /C:"Found DFU"
) else (
    echo ✗ No DFU devices found
    echo.
    echo Troubleshooting steps:
    echo 1. Put device in DFU mode ^(hold BOOT button while connecting USB^)
    echo 2. Install DFU drivers using Zadig ^(Programs\zadig-2.9.exe^)
    echo 3. Check Device Manager for unknown USB devices
    echo 4. Try different USB cable/port
    echo 5. Run this script as Administrator
)
echo.

echo === NEXT STEPS ===
echo If DFU devices were found above but your app doesn't show them:
echo 1. Start your app with: npm run dev
echo 2. Open Developer Tools ^(F12^)
echo 3. Go to Console tab
echo 4. Paste this code and press Enter:
echo.
echo    window.electronAPI.getDfuDevices^(^).then^(result =^> console.log^(result^)^)
echo.
echo 5. Check the result - it should show success: true and your devices
echo.

pause
