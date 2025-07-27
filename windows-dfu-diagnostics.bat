@echo off
echo ========================================
echo DFU Device Detection Diagnostics
echo ========================================
echo Run this on the Windows machine to diagnose DFU issues
echo.

echo Step 1: Checking if dfu-util.exe exists and runs...
if exist "Programs\dfu-util\dfu-util.exe" (
    echo ✓ dfu-util.exe found
    Programs\dfu-util\dfu-util.exe --version
    if errorlevel 1 (
        echo ✗ dfu-util.exe failed to run - possible compatibility issue
    ) else (
        echo ✓ dfu-util.exe runs successfully
    )
) else (
    echo ✗ dfu-util.exe NOT FOUND at Programs\dfu-util\dfu-util.exe
    echo Current directory: %CD%
    echo Listing Programs directory:
    if exist "Programs" (
        dir Programs
    ) else (
        echo Programs directory does not exist!
    )
    goto :error_exit
)

echo.
echo Step 2: Scanning for DFU devices...
echo Running: Programs\dfu-util\dfu-util.exe -l
echo.
Programs\dfu-util\dfu-util.exe -l
set DFU_RESULT=%errorlevel%

echo.
echo DFU scan exit code: %DFU_RESULT%

if %DFU_RESULT% equ 0 (
    echo ✓ DFU scan completed successfully
) else (
    echo ✗ DFU scan failed or no devices found
)

echo.
echo Step 3: Checking Windows Device Manager...
echo Please check Windows Device Manager for:
echo 1. Unknown devices with yellow warning triangles
echo 2. USB devices that might be your DFU device
echo 3. Any STM32 or DFU-related entries
echo.

echo Step 4: USB Device List (using Windows tools)...
wmic path Win32_USBHub get deviceid,description 2>nul
if errorlevel 1 (
    echo Could not list USB devices with wmic
)

echo.
echo Step 5: Checking for common DFU device signatures...
echo Looking for STM32 DFU devices (VID=0483, PID=DF11)...
echo.

echo ========================================
echo TROUBLESHOOTING CHECKLIST
echo ========================================
echo.
echo If no DFU devices found, try these steps:
echo.
echo 1. DEVICE IN DFU MODE:
echo    - Power off your device
echo    - Hold the BOOT/DFU button (if available)
echo    - Connect USB cable while holding button
echo    - Release button after 2-3 seconds
echo.
echo 2. USB DRIVER ISSUES:
echo    - Open Device Manager (devmgmt.msc)
echo    - Look for "Unknown Device" or device with yellow warning
echo    - Right-click and "Update Driver"
echo    - Or use Zadig to install WinUSB driver
echo.
echo 3. USB CABLE AND PORT:
echo    - Try a different USB cable (data cable, not charge-only)
echo    - Try different USB port
echo    - Try USB 2.0 port instead of USB 3.0
echo.
echo 4. WINDOWS PERMISSIONS:
echo    - Run this command prompt as Administrator
echo    - Some USB operations require elevated privileges
echo.
echo 5. ANTIVIRUS/SECURITY:
echo    - Temporarily disable antivirus
echo    - Check Windows Defender exclusions
echo.

:error_exit
echo.
echo Diagnostics completed. 
echo If issues persist, run Zadig (Programs\zadig-2.9.exe) to install USB drivers.
pause
