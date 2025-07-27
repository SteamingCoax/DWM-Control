@echo off
echo ========================================
echo Temporary Workaround - Disable SerialPort
echo ========================================
echo This creates a backup and temporarily disables SerialPort
echo so you can test other parts of the application
echo.

REM Create backup of main.js
if not exist "main.js.backup" (
    echo Creating backup of main.js...
    copy "main.js" "main.js.backup"
)

echo.
echo Modifying main.js to comment out SerialPort...

REM Use PowerShell to modify the file
powershell -Command "(Get-Content main.js) -replace 'const { SerialPort } = require\(''serialport''\);', '// TEMP DISABLED: const { SerialPort } = require(''serialport'');' | Set-Content main.js.temp"

if exist "main.js.temp" (
    move "main.js.temp" "main.js"
    echo SerialPort temporarily disabled in main.js
) else (
    echo Failed to modify main.js automatically
    echo.
    echo MANUAL STEPS:
    echo 1. Open main.js in a text editor
    echo 2. Find the line: const { SerialPort } = require('serialport');
    echo 3. Comment it out: // const { SerialPort } = require('serialport');
    echo 4. Save the file
    echo 5. Run: npm run dev
    echo.
    echo To restore later, run: restore-serialport.bat
)

echo.
echo Starting application without SerialPort...
npm run dev

echo.
echo To restore SerialPort functionality later, run: restore-serialport.bat
pause
