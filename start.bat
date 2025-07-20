@echo off
REM Simple launcher that quickly runs DWM-Control without setup overhead

echo Starting DWM-Control...

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if virtual environment exists and is working
if exist "venv\Scripts\activate.bat" (
    REM Try to activate virtual environment quietly
    call venv\Scripts\activate.bat >nul 2>&1
    if not errorlevel 1 (
        REM Check if Python works in venv
        python --version >nul 2>&1
        if not errorlevel 1 (
            REM Check if required packages are available (quick test)
            python -c "import PyQt6.QtWidgets; import serial; import intelhex" >nul 2>&1
            if not errorlevel 1 (
                REM Everything looks good, launch the app
                echo Launching DWM-Control...
                python DWM-Control.py
                goto :end
            ) else (
                echo Missing required packages. Running full setup...
                call run_windows.bat
                goto :end
            )
        )
    )
)

REM Virtual environment not working, try system Python
if exist "DWM-Control.py" (
    echo Virtual environment not available, trying system Python...
    python DWM-Control.py >nul 2>&1
    if errorlevel 1 (
        echo.
        echo Failed to run with system Python.
        echo Running full setup to create proper environment...
        if exist "setup_windows.bat" (
            call setup_windows.bat
        ) else (
            call run_windows.bat
        )
    )
    goto :end
)

echo ERROR: Could not find DWM-Control.py in current directory
echo Please ensure you're running this from the DWM-Control folder

:end
if errorlevel 1 (
    echo.
    pause
)
