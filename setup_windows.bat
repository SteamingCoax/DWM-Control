@echo off
REM DWM-Control Windows Setup Script
REM This script helps first-time users set up everything needed

echo.
echo ========================================
echo   DWM-Control Windows Setup
echo ========================================
echo.
echo This script will help you set up DWM-Control on Windows.
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo Checking system requirements...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] Python is NOT installed
    echo.
    echo Python 3.8 or higher is required to run DWM-Control.
    echo.
    echo Please visit: https://python.org/downloads/
    echo 1. Download Python 3.8 or higher
    echo 2. During installation, CHECK "Add Python to PATH"
    echo 3. Run this setup script again after installation
    echo.
    pause
    exit /b 1
) else (
    echo [✓] Python is installed
    python --version
)

REM Check Python version
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo     Version: %PYTHON_VERSION%

REM Check if pip is available
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [X] pip is NOT available
    echo.
    echo pip is required to install Python packages.
    echo Please reinstall Python with pip included.
    pause
    exit /b 1
) else (
    echo [✓] pip is available
)

REM Check if Git is available (optional)
git --version >nul 2>&1
if errorlevel 1 (
    echo [!] Git is not installed (optional)
    echo     You can install Git from: https://git-scm.com/download/win
) else (
    echo [✓] Git is available
)

echo.
echo ========================================
echo   Setting up DWM-Control environment
echo ========================================
echo.

REM Create virtual environment
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [✓] Virtual environment created
) else (
    echo [✓] Virtual environment already exists
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [!] Failed to activate existing virtual environment
    echo     This usually means the virtual environment is corrupted
    echo     Recreating virtual environment...
    
    REM Remove corrupted virtual environment
    if exist "venv" (
        echo Removing corrupted virtual environment...
        rmdir /s /q venv
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
    
    echo [✓] Virtual environment recreated and activated successfully
) else (
    echo [✓] Virtual environment activated successfully
)

REM Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo [!] Failed to upgrade pip in virtual environment
    echo     Attempting to install pip using ensurepip...
    python -m ensurepip --upgrade --default-pip
    if errorlevel 1 (
        echo [!] ensurepip failed, trying to bootstrap pip manually...
        
        REM Try to install pip using get-pip.py
        echo Downloading and installing pip...
        python -c "import urllib.request; urllib.request.urlretrieve('https://bootstrap.pypa.io/get-pip.py', 'get-pip.py')"
        if exist "get-pip.py" (
            python get-pip.py
            del get-pip.py
            if errorlevel 1 (
                echo ERROR: Failed to install pip in virtual environment
                echo Please try recreating the virtual environment
                pause
                exit /b 1
            )
        ) else (
            echo ERROR: Could not download pip installer
            echo Please check your internet connection
            pause
            exit /b 1
        )
    )
    echo [✓] pip installed successfully
) else (
    echo [✓] pip upgraded successfully
)

REM Verify pip is working
echo Verifying pip installation...
python -m pip --version
if errorlevel 1 (
    echo ERROR: pip is still not working in virtual environment
    echo The virtual environment may be corrupted
    echo Please run cleanup_windows.bat to reset the environment
    pause
    exit /b 1
)
echo [✓] pip is working correctly

REM Install requirements
echo Installing required Python packages...
echo This may take a few minutes...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install some packages
    echo Please check your internet connection and try again
    pause
    exit /b 1
)

echo [✓] All Python packages installed successfully

echo.
echo ========================================
echo   Optional: DFU-util setup
echo ========================================
echo.

REM Check if DFU-util is available
dfu-util --version >nul 2>&1
if errorlevel 1 (
    echo [!] dfu-util is not installed
    echo.
    echo dfu-util is needed for firmware uploading functionality.
    echo.
    echo To install dfu-util:
    echo 1. Download from: http://dfu-util.sourceforge.net/
    echo 2. Extract to a folder
    echo 3. Add the folder to your Windows PATH
    echo    OR copy dfu-util.exe to this DWM-Control folder
    echo.
    echo You can also install it via chocolatey: choco install dfu-util
    echo Or via scoop: scoop install dfu-util
    echo.
) else (
    echo [✓] dfu-util is available
    dfu-util --version 2>&1 | findstr /r "dfu-util [0-9]"
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo DWM-Control is now ready to use on Windows.
echo.
echo To start the application:
echo   • Double-click: start.bat
echo   • Or run: run_windows.bat
echo   • Or use PowerShell: run_windows.ps1
echo.
echo For driver installation (when needed):
echo   • The app will guide you through Zadig installation
echo   • This only needs to be done once per computer
echo.

REM Test launch option
set /p "LAUNCH=Would you like to launch DWM-Control now? (y/N): "
if /i "%LAUNCH%"=="y" (
    echo.
    echo Launching DWM-Control...
    python DWM-Control.py
) else (
    echo.
    echo Setup complete! You can now run DWM-Control anytime.
)

echo.
pause
