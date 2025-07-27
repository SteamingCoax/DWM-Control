@echo off
echo ========================================
echo DWM Control App - DFU Test
echo ========================================
echo This tests the same DFU detection the app uses
echo.

echo Testing the exact command the app runs...
echo.

set DFU_PATH=Programs\dfu-util\dfu-util.exe

if not exist "%DFU_PATH%" (
    echo ERROR: %DFU_PATH% not found!
    echo Make sure you're in the DWM-Control directory
    pause
    exit /b 1
)

echo Running: %DFU_PATH% -l
echo.
echo === DFU SCAN OUTPUT ===
"%DFU_PATH%" -l
set RESULT=%errorlevel%
echo === END OUTPUT ===
echo.

echo Exit code: %RESULT%
echo.

if %RESULT% equ 0 (
    echo ✓ Command succeeded
    echo If you see "Found DFU" lines above, devices were detected
    echo If no "Found DFU" lines, no devices are in DFU mode
) else (
    echo ✗ Command failed
    echo This could indicate:
    echo - Missing USB drivers
    echo - Permission issues  
    echo - dfu-util compatibility problems
)

echo.
echo Now testing if the app would detect devices...
echo The app looks for lines containing "Found DFU" in the output above.
echo.

pause
