@echo off
REM Super fast DWM-Control launcher - assumes everything is set up

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Activate virtual environment if it exists
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat >nul 2>&1
)

REM Set minimal Qt environment
set QT_QPA_PLATFORM=windows

REM Launch immediately
python DWM-Control.py
