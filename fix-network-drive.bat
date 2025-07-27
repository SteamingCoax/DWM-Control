@echo off
echo ========================================
echo Network Drive Detection and Fix
echo ========================================
echo.

echo Current drive: %CD:~0,2%

if "%CD:~0,2%"=="Z:" (
    echo WARNING: You are running from a network drive Z:
    echo This often causes npm installation failures and native module issues!
    echo.
    echo RECOMMENDED SOLUTIONS:
    echo.
    echo 1. COPY PROJECT TO LOCAL DRIVE:
    echo    - Copy this entire folder to C:\Projects\DWM-Control
    echo    - Run the scripts from the local copy
    echo.
    echo 2. OR TRY NETWORK DRIVE WORKAROUNDS:
    echo    - Clear npm cache completely
    echo    - Use different npm registry
    echo    - Install with --no-optional flag
    echo.
    echo Would you like to try the network drive workarounds? [Y/N]
    set /p choice=
    if /i "%choice%"=="Y" (
        goto :network_workarounds
    ) else (
        echo Please copy the project to a local drive like C:\Projects\DWM-Control
        echo Then run the scripts from there.
        pause
        exit /b 1
    )
) else (
    echo Good! Running from local drive.
    goto :normal_install
)

:network_workarounds
echo.
echo Attempting network drive workarounds...
echo.

echo Step 1: Clearing npm cache completely...
npm cache clean --force

echo.
echo Step 2: Setting npm to use alternative registry...
npm config set registry https://registry.npmjs.org/

echo.
echo Step 3: Removing problematic directories...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del "package-lock.json"

echo.
echo Step 4: Installing with workaround flags...
npm install --no-optional --prefer-offline --no-audit

if errorlevel 1 (
    echo Network drive installation failed.
    echo Please copy project to local drive C:\Projects\DWM-Control
    pause
    exit /b 1
)

goto :post_install

:normal_install
echo Installing dependencies normally...
npm install

if errorlevel 1 (
    echo Installation failed. Trying with cache clean...
    npm cache clean --force
    npm install
    if errorlevel 1 (
        echo Installation still failing. Check your internet connection.
        pause
        exit /b 1
    )
)

:post_install
echo.
echo Installation completed! Now testing the application...
npm run dev

pause
