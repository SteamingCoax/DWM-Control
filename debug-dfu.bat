@echo off
REM DFU Debug Test for Windows

echo === DFU DEBUGGING SCRIPT ===
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

REM Test 2: Check Windows version and drivers
echo 2. System information...
ver
echo.

REM Test 3: List DFU devices
echo 3. Scanning for DFU devices...
echo Command: %DFUUTIL_CMD% -l
%DFUUTIL_CMD% -l > temp_dfu_output.txt 2>&1
set EXIT_CODE=%errorlevel%

echo Exit code: %EXIT_CODE%
echo Raw output:
echo --------
type temp_dfu_output.txt
echo --------
echo.

REM Test 4: Parse the output
echo 4. Analyzing output...
findstr /C:"Found DFU" temp_dfu_output.txt > nul
if %errorlevel% == 0 (
    echo ✓ DFU devices detected!
    echo DFU lines:
    findstr /C:"Found DFU" temp_dfu_output.txt
) else (
    echo ✗ No DFU devices found
    findstr /C:"No DFU capable USB device" temp_dfu_output.txt > nul
    if %errorlevel% == 0 (
        echo Reason: No DFU devices connected or not in DFU mode
    ) else (
        findstr /C:"Access is denied" temp_dfu_output.txt > nul
        if %errorlevel% == 0 (
            echo Reason: Permission issue - try running as Administrator
        ) else (
            echo Reason: Unknown - check raw output above
        )
    )
)
echo.

REM Test 5: Node.js parsing test (if available)
echo 5. Testing Node.js parsing...
where node > nul 2>&1
if %errorlevel% == 0 (
    echo Creating parsing test...
    echo function parseDfuDevices(output) { > temp_parse_test.js
    echo   const devices = []; >> temp_parse_test.js
    echo   const lines = output.split('\n'); >> temp_parse_test.js
    echo   for (const line of lines) { >> temp_parse_test.js
    echo     if (line.includes('Found DFU')) { >> temp_parse_test.js
    echo       console.log('Processing line:', line); >> temp_parse_test.js
    echo       const match = line.match(/Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\]/i); >> temp_parse_test.js
    echo       if (match) { >> temp_parse_test.js
    echo         const vid = match[1]; >> temp_parse_test.js
    echo         const pid = match[2]; >> temp_parse_test.js
    echo         let serial = 'unknown'; >> temp_parse_test.js
    echo         const serialMatch = line.match(/serial="([^"]+)"/); >> temp_parse_test.js
    echo         if (serialMatch) { >> temp_parse_test.js
    echo           serial = serialMatch[1]; >> temp_parse_test.js
    echo         } else { >> temp_parse_test.js
    echo           const altSerialMatch = line.match(/serial=([^\s,]+)/); >> temp_parse_test.js
    echo           if (altSerialMatch) { >> temp_parse_test.js
    echo             serial = altSerialMatch[1]; >> temp_parse_test.js
    echo           } >> temp_parse_test.js
    echo         } >> temp_parse_test.js
    echo         devices.push({vid, pid, serial, description: line.trim()}); >> temp_parse_test.js
    echo       } >> temp_parse_test.js
    echo     } >> temp_parse_test.js
    echo   } >> temp_parse_test.js
    echo   return devices; >> temp_parse_test.js
    echo } >> temp_parse_test.js
    echo const fs = require('fs'); >> temp_parse_test.js
    echo const output = fs.readFileSync('temp_dfu_output.txt', 'utf8'); >> temp_parse_test.js
    echo const devices = parseDfuDevices(output); >> temp_parse_test.js
    echo console.log('Parsed devices:', JSON.stringify(devices, null, 2)); >> temp_parse_test.js
    echo console.log('Device count:', devices.length); >> temp_parse_test.js
    
    node temp_parse_test.js
    del temp_parse_test.js
) else (
    echo Node.js not found - skipping parsing test
)
echo.

echo === INSTRUCTIONS ===
echo If no devices found:
echo 1. Put your device in DFU mode ^(usually hold BOOT button while connecting USB^)
echo 2. Install DFU drivers using Zadig ^(Programs\zadig-2.9.exe^)
echo 3. Check USB cable and port
echo 4. Try running this script as Administrator
echo 5. Check Device Manager for unknown USB devices
echo.
echo If devices found but app doesn't show them:
echo 1. Check the app's console for errors ^(F12 -^> Console^)
echo 2. Restart the app to reload any code changes
echo 3. Add dfu-debug.js to your app and check console
echo.

del temp_dfu_output.txt
pause
