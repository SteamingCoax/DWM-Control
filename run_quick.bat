@echo off
REM Quick DWM-Control launcher - minimal setup, maximum speed

echo.
echo ========================================
echo   DWM-Control Quick Launch
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo Virtual environment not found. Creating minimal setup...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        echo Please run setup_windows.bat for full setup
        pause
        exit /b 1
    )
)

REM Activate virtual environment
call venv\Scripts\activate.bat >nul 2>&1
if errorlevel 1 (
    echo Virtual environment corrupted. Please run cleanup_windows.bat
    pause
    exit /b 1
)

REM Quick check if packages are installed
python -c "import PyQt6.QtWidgets; import serial; import intelhex; import requests" >nul 2>&1
if errorlevel 1 (
    echo Installing required packages (one-time setup)...
    python -m pip install --upgrade pip --quiet
    python -m pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo ERROR: Failed to install packages
        echo Please run setup_windows.bat for detailed setup
        pause
        exit /b 1
    )
    echo Packages installed successfully!
)

REM Set minimal Qt environment
set QT_QPA_PLATFORM=windows

REM Launch the application
echo Launching DWM-Control...
echo.
python DWM-Control.py

REM Check exit code
if errorlevel 1 (
    echo.
    echo Application exited with error. 
    echo For detailed diagnostics, run: run_windows.bat
    pause
)
