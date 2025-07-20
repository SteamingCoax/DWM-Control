@echo off
REM Enhanced build script for libwdi.dll with automatic VS environment detection
REM This script attempts to find and setup Visual Studio environment automatically

echo Building libwdi for DWM-Control...

REM Check if we're already in a VS Developer environment
where msbuild >nul 2>&1
if %errorlevel% equ 0 (
    echo Found MSBuild, proceeding with build...
    goto :build
)

echo MSBuild not found, attempting to locate Visual Studio...

REM Try to find and setup Visual Studio environment
REM Check for VS 2022
if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2022 Community
    call "%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
    goto :build
)

if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2022 Professional
    call "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
    goto :build
)

if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2022 Enterprise
    call "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
    goto :build
)

REM Check for VS 2019
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2019 Community
    call "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\Common7\Tools\VsDevCmd.bat"
    goto :build
)

if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Professional\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2019 Professional
    call "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Professional\Common7\Tools\VsDevCmd.bat"
    goto :build
)

if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Enterprise\Common7\Tools\VsDevCmd.bat" (
    echo Found Visual Studio 2019 Enterprise
    call "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Enterprise\Common7\Tools\VsDevCmd.bat"
    goto :build
)

REM If we get here, VS wasn't found automatically
echo Error: Could not automatically locate Visual Studio installation.
echo.
echo Please try one of these options:
echo.
echo Option 1 - Manual Developer Command Prompt:
echo 1. Open "Developer Command Prompt for VS" from the Start Menu
echo 2. Navigate to this directory: %CD%
echo 3. Run this script again
echo.
echo Option 2 - Install Visual Studio:
echo 1. Download Visual Studio Community (free) from:
echo    https://visualstudio.microsoft.com/downloads/
echo 2. During installation, select "C++ build tools" workload
echo 3. Run this script again
echo.
pause
exit /b 1

:build
REM Verify MSBuild is now available
where msbuild >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: MSBuild still not found after setting up VS environment
    echo Please ensure Visual Studio C++ build tools are installed
    pause
    exit /b 1
)

REM Change to Programs/libwdi directory
if not exist "Programs\libwdi\libwdi.sln" (
    echo Error: Programs\libwdi\libwdi.sln not found
    echo Make sure you're running this from the DWM-Control directory
    echo and that libwdi is properly placed in the Programs folder
    pause
    exit /b 1
)

cd Programs\libwdi

echo Building libwdi.dll (64-bit Release)...
msbuild libwdi.sln /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v143 /verbosity:minimal

if %errorlevel% neq 0 (
    echo Error: Build failed
    echo.
    echo This might be due to:
    echo 1. Missing Windows SDK
    echo 2. Incompatible Visual Studio version
    echo 3. Missing C++ build tools
    echo.
    echo Try installing "Desktop development with C++" workload in Visual Studio
    pause
    exit /b 1
)

REM Find the built DLL
set "DLL_PATH=libwdi\.msvc\x64\Release\dll\libwdi.dll"
if exist "%DLL_PATH%" (
    echo Success! Built libwdi.dll
    echo.
    echo Copying DLL to Programs folder...
    copy "%DLL_PATH%" "..\libwdi.dll"
    if %errorlevel% equ 0 (
        echo libwdi.dll copied successfully to Programs folder!
        echo.
        echo The seamless driver installation feature is now available.
        echo Your DWM-Control application will automatically use libwdi
        echo for driver installation when needed.
    ) else (
        echo Warning: Failed to copy DLL to Programs folder
        echo You can manually copy from: Programs\libwdi\%DLL_PATH%
    )
) else (
    echo Warning: libwdi.dll not found at expected location
    echo Expected: Programs\libwdi\%DLL_PATH%
    echo Please check the build output above for errors
)

cd ..\..

echo.
echo Build complete! Press any key to continue...
pause >nul
