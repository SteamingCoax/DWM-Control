@echo off
echo ========================================
echo NETWORK DRIVE ISSUE DETECTED
echo ========================================
echo.
echo You are running from drive: %CD:~0,2%
echo.
echo PROBLEM: Network drives (like Z:) often cause issues with:
echo - npm installations
echo - Native module compilation  
echo - File locking and permissions
echo.
echo SOLUTION: Copy project to local drive
echo.
echo RECOMMENDED STEPS:
echo.
echo 1. Create directory: C:\Projects\
echo 2. Copy this entire DWM-Control folder to: C:\Projects\DWM-Control\
echo 3. Open Command Prompt in: C:\Projects\DWM-Control\
echo 4. Run: test-app.bat
echo.
echo QUICK COPY COMMANDS:
echo.
echo   mkdir C:\Projects
echo   xcopy Z:\*.* C:\Projects\DWM-Control\ /E /I /H /Y
echo   cd C:\Projects\DWM-Control
echo   test-app.bat
echo.
echo Would you like me to show you the copy command? [Y/N]
set /p choice=
if /i "%choice%"=="Y" (
    echo.
    echo Copy this command and run it:
    echo.
    echo mkdir C:\Projects 2^>nul ^&^& xcopy "%CD%" C:\Projects\DWM-Control\ /E /I /H /Y ^&^& echo Project copied successfully!
    echo.
    echo Then navigate to C:\Projects\DWM-Control and run test-app.bat
    echo.
)

pause
