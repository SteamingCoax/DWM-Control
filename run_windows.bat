@echo off
REM DWM-Control Windows Launcher Script
REM This script sets up the Python environment and runs the application

echo.
echo ========================================
echo   DWM-Control Windows Launcher
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo Python found: 
python --version

REM Check if virtual environment exists
if not exist "venv" (
    echo.
    echo Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
)

REM Activate virtual environment
echo.
echo Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo WARNING: Failed to activate existing virtual environment
    echo This usually means the virtual environment is corrupted
    echo Recreating virtual environment...
    
    REM Remove corrupted virtual environment
    if exist "venv" (
        echo Removing corrupted virtual environment...
        rmdir /s /q venv >nul 2>&1
    )
    
    REM Create new virtual environment
    echo Creating new Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create new virtual environment
        echo Please ensure Python is properly installed and accessible
        pause
        exit /b 1
    )
    
    REM Try to activate again
    echo Activating new virtual environment...
    call venv\Scripts\activate.bat
    if errorlevel 1 (
        echo ERROR: Failed to activate even the new virtual environment
        echo There may be an issue with your Python installation
        pause
        exit /b 1
    )
    
    echo Virtual environment recreated and activated successfully!
)

REM Install/update requirements
echo.
echo Checking Python packages...

REM Check if pip is available in virtual environment
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: pip not found in virtual environment, attempting to install...
    python -m ensurepip --upgrade --default-pip
    if errorlevel 1 (
        echo ERROR: Failed to install pip in virtual environment
        echo Please run cleanup_windows.bat to reset the environment
        pause
        exit /b 1
    )
)

REM Quick check if main packages are available
python -c "import PyQt6.QtWidgets; import serial; import intelhex; import requests" >nul 2>&1
if errorlevel 1 (
    echo Installing missing packages...
    python -m pip install --upgrade pip --quiet
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo WARNING: Some packages may have failed to install
        echo The application might still work, but some features may be unavailable
    ) else (
        echo [✓] All packages are now available
    )
) else (
    echo [✓] All required packages are available
)

REM Set up Windows-specific environment variables for Qt
set QT_QPA_PLATFORM=windows
set QT_SCALE_FACTOR_ROUNDING_POLICY=RoundPreferFloor

REM Check if DFU-util is available (optional, only show if verbose mode)
if "%1"=="--verbose" (
    echo.
    echo Checking for dfu-util...
    dfu-util --version >nul 2>&1
    if errorlevel 1 (
        echo [!] dfu-util not found in PATH
        echo     Firmware upload functionality may require manual dfu-util installation
        echo     Download from: http://dfu-util.sourceforge.net/
    ) else (
        echo [✓] DFU-util found:
        dfu-util --version 2>&1 | findstr /r "dfu-util [0-9]"
    )
)

REM Launch the application
echo.
echo ========================================
echo   Launching DWM-Control...
echo ========================================
echo.

python DWM-Control.py

REM Check exit code
if errorlevel 1 (
    echo.
    echo ========================================
    echo   Application exited with error
    echo ========================================
    echo.
    echo If you encountered issues, please check:
    echo 1. All required packages are installed
    echo 2. Your device drivers are properly installed
    echo 3. No other applications are using the same ports
    echo.
) else (
    echo.
    echo ========================================
    echo   Application closed normally
    echo ========================================
)

echo.
echo Press any key to close this window...
pause >nul
