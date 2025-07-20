@echo off
REM Enhanced Virtual Environment Creator for DWM-Control
REM This script ensures pip is properly installed in the virtual environment

echo.
echo ========================================
echo   Virtual Environment Diagnostics
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo Checking Python and pip installation...
echo.

REM Check system Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] System Python not found
    echo Please install Python from https://python.org
    pause
    exit /b 1
) else (
    echo [✓] System Python found:
    python --version
)

REM Check system pip
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [X] System pip not found
    echo Please reinstall Python with pip included
    pause
    exit /b 1
) else (
    echo [✓] System pip found:
    python -m pip --version
)

echo.
echo ========================================
echo   Virtual Environment Analysis
echo ========================================
echo.

if exist "venv" (
    echo [!] Existing virtual environment found
    echo Checking virtual environment health...
    
    REM Try to activate existing environment
    call venv\Scripts\activate.bat >nul 2>&1
    if errorlevel 1 (
        echo [X] Virtual environment activation failed
        echo [!] Environment is corrupted and needs recreation
        goto :recreate_venv
    )
    
    REM Check if pip works in virtual environment
    python -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo [X] pip not working in virtual environment
        echo [!] Environment needs pip installation or recreation
        goto :fix_pip
    ) else (
        echo [✓] Virtual environment and pip are working
        python -m pip --version
        echo.
        echo Virtual environment is healthy!
        goto :end
    )
) else (
    echo [!] No virtual environment found
    goto :create_venv
)

:fix_pip
echo.
echo ========================================
echo   Fixing pip in Virtual Environment
echo ========================================
echo.

echo Attempting to install pip in existing virtual environment...
python -m ensurepip --upgrade --default-pip
if errorlevel 1 (
    echo [X] Failed to install pip with ensurepip
    echo [!] Recreating virtual environment...
    goto :recreate_venv
) else (
    echo [✓] pip installed successfully
    python -m pip --version
    goto :end
)

:recreate_venv
echo.
echo ========================================
echo   Recreating Virtual Environment
echo ========================================
echo.

if exist "venv" (
    echo Removing existing virtual environment...
    rmdir /s /q venv
)

:create_venv
echo Creating new virtual environment...
python -m venv venv --upgrade-deps
if errorlevel 1 (
    echo [X] Failed to create virtual environment with --upgrade-deps
    echo Trying without --upgrade-deps...
    python -m venv venv
    if errorlevel 1 (
        echo [X] Failed to create virtual environment
        echo Please check your Python installation
        pause
        exit /b 1
    )
)

echo Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [X] Failed to activate new virtual environment
    pause
    exit /b 1
)

echo Verifying pip in new virtual environment...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [!] pip not found, installing with ensurepip...
    python -m ensurepip --upgrade --default-pip
    if errorlevel 1 (
        echo [X] ensurepip failed, trying manual installation...
        echo Downloading get-pip.py...
        python -c "import urllib.request; urllib.request.urlretrieve('https://bootstrap.pypa.io/get-pip.py', 'get-pip.py')"
        if exist "get-pip.py" (
            python get-pip.py
            del get-pip.py
            if errorlevel 1 (
                echo [X] Manual pip installation failed
                pause
                exit /b 1
            )
        ) else (
            echo [X] Could not download pip installer
            pause
            exit /b 1
        )
    )
)

echo [✓] Virtual environment created successfully
python -m pip --version

:end
echo.
echo ========================================
echo   Environment Status
echo ========================================
echo.

echo Python version in virtual environment:
python --version

echo pip version in virtual environment:
python -m pip --version

echo Virtual environment location:
echo %CD%\venv

echo.
echo [✓] Virtual environment is ready for use!
echo.
echo You can now run:
echo   • start.bat (to launch DWM-Control)
echo   • run_windows.bat (full setup and launch)
echo   • setup_windows.bat (install packages)
echo.

pause
