@echo off
REM DWM-Control Environment Cleanup Script
REM Use this script when you have virtual environment issues

echo.
echo ========================================
echo   DWM-Control Environment Cleanup
echo ========================================
echo.
echo This script will clean up and recreate your Python environment.
echo Use this if you're having issues with virtual environments.
echo.

set /p "CONFIRM=Are you sure you want to reset the environment? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Operation cancelled.
    pause
    exit /b 0
)

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo Cleaning up environment...

REM Remove virtual environment
if exist "venv" (
    echo Removing existing virtual environment...
    rmdir /s /q venv
    if exist "venv" (
        echo WARNING: Some files could not be removed. They may be in use.
        echo Please close any Python processes and try again.
        pause
        exit /b 1
    )
    echo [✓] Virtual environment removed
) else (
    echo [✓] No virtual environment to remove
)

REM Remove Python cache files
if exist "__pycache__" (
    echo Removing Python cache files...
    rmdir /s /q __pycache__
    echo [✓] Python cache cleaned
)

REM Find and remove .pyc files
echo Cleaning up .pyc files...
for /r %%i in (*.pyc) do del "%%i" >nul 2>&1
echo [✓] .pyc files cleaned

echo.
echo ========================================
echo   Recreating Environment
echo ========================================
echo.

REM Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not available
    echo Please ensure Python is installed and in your PATH
    pause
    exit /b 1
)

echo Python found:
python --version

REM Create new virtual environment
echo.
echo Creating new virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment
    echo Please check your Python installation
    pause
    exit /b 1
)
echo [✓] Virtual environment created

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    echo This indicates a problem with the Python installation
    pause
    exit /b 1
)
echo [✓] Virtual environment activated

REM Ensure pip is available in virtual environment
echo.
echo Ensuring pip is available...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [!] pip not found in virtual environment, installing...
    python -m ensurepip --upgrade --default-pip
    if errorlevel 1 (
        echo ERROR: Failed to install pip in virtual environment
        echo This indicates a problem with the Python installation
        pause
        exit /b 1
    )
    echo [✓] pip installed in virtual environment
) else (
    echo [✓] pip is available
)

REM Upgrade pip
echo.
echo Upgrading pip...
python -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo WARNING: Failed to upgrade pip, but continuing...
)

REM Install requirements
echo Installing required packages...
echo This may take a few minutes...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install some packages
    echo Please check your internet connection and requirements.txt file
    pause
    exit /b 1
)

echo [✓] All packages installed successfully

echo.
echo ========================================
echo   Cleanup Complete!
echo ========================================
echo.
echo Your Python environment has been reset and is ready to use.
echo.
echo You can now run DWM-Control using:
echo   • start.bat
echo   • run_windows.bat
echo.

set /p "LAUNCH=Would you like to test launch DWM-Control now? (y/N): "
if /i "%LAUNCH%"=="y" (
    echo.
    echo Testing DWM-Control launch...
    python DWM-Control.py
) else (
    echo.
    echo Environment reset complete!
)

echo.
pause
