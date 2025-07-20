@echo off
REM Build script for libwdi.dll
REM This script builds libwdi using Visual Studio tools

echo Building libwdi for DWM-Control...

REM Check if we're in a Visual Studio Developer Command Prompt
where msbuild >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: MSBuild not found. Please run this from a Visual Studio Developer Command Prompt.
    echo.
    echo To fix this:
    echo 1. Open "Developer Command Prompt for VS" from the Start Menu
    echo 2. Navigate to this directory
    echo 3. Run this script again
    pause
    exit /b 1
)

REM Change to libwdi directory
if not exist "libwdi\libwdi.sln" (
    echo Error: libwdi\libwdi.sln not found
    echo Make sure you're running this from the DWM-Control directory
    pause
    exit /b 1
)

cd libwdi

echo Building libwdi.dll (64-bit Release)...
msbuild libwdi.sln /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v143

if %errorlevel% neq 0 (
    echo Error: Build failed
    pause
    exit /b 1
)

REM Find the built DLL
set "DLL_PATH=libwdi\.msvc\x64\Release\dll\libwdi.dll"
if exist "%DLL_PATH%" (
    echo Success! Built libwdi.dll
    echo.
    echo Copying DLL to Programs folder...
    if not exist "..\Programs" mkdir "..\Programs"
    copy "%DLL_PATH%" "..\Programs\libwdi.dll"
    if %errorlevel% equ 0 (
        echo libwdi.dll copied successfully to Programs folder!
        echo.
        echo You can now use the seamless driver installation feature.
    ) else (
        echo Warning: Failed to copy DLL to Programs folder
        echo You can manually copy from: %DLL_PATH%
    )
) else (
    echo Warning: libwdi.dll not found at expected location
    echo Please check the build output above for errors
)

cd ..

echo.
echo Build complete! Press any key to continue...
pause >nul
