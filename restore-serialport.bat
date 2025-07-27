@echo off
echo ========================================
echo Restore SerialPort Functionality
echo ========================================
echo.

if exist "main.js.backup" (
    echo Restoring original main.js from backup...
    copy "main.js.backup" "main.js"
    echo SerialPort functionality restored!
    echo.
    echo Now you can try fixing the native module issue with:
    echo - nuclear-fix.bat
    echo - alternative-fix.bat
    echo.
) else (
    echo No backup found. Cannot restore automatically.
    echo You may need to manually uncomment the SerialPort line in main.js
)

pause
