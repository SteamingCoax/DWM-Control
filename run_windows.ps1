# DWM-Control Windows PowerShell Launcher
# This script sets up the Python environment and runs the application

Write-Host ""
Write-Host "========================================"
Write-Host "  DWM-Control Windows Launcher (PS)"
Write-Host "========================================"
Write-Host ""

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Function to test if a command exists
function Test-Command($Command) {
    try {
        if (Get-Command $Command -ErrorAction Stop) { return $true }
    }
    catch { return $false }
}

# Check if Python is available
if (-not (Test-Command "python")) {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.8 or higher from https://python.org"
    Write-Host "Make sure to check 'Add Python to PATH' during installation"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Python found: " -NoNewline
python --version

# Check Python version
$pythonVersion = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$version = [System.Version]$pythonVersion
if ($version -lt [System.Version]"3.8") {
    Write-Host "ERROR: Python 3.8 or higher is required. Found: $pythonVersion" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host ""
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create virtual environment" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "Virtual environment created successfully!" -ForegroundColor Green
}

# Activate virtual environment
Write-Host ""
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& "venv\Scripts\Activate.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to activate virtual environment" -ForegroundColor Red
    Write-Host "You may need to run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
    Read-Host "Press Enter to exit"
    exit 1
}

# Install/update requirements
Write-Host ""
Write-Host "Installing/updating Python packages..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Some packages may have failed to install" -ForegroundColor Yellow
    Write-Host "The application might still work, but some features may be unavailable"
}

# Set up Windows-specific environment variables for Qt
Write-Host ""
Write-Host "Setting up Qt environment for Windows..." -ForegroundColor Yellow
$env:QT_QPA_PLATFORM = "windows"
$env:QT_SCALE_FACTOR_ROUNDING_POLICY = "RoundPreferFloor"

# Check if DFU-util is available (optional)
if (Test-Command "dfu-util") {
    Write-Host ""
    Write-Host "DFU-util found:" -ForegroundColor Green
    dfu-util --version 2>&1 | Select-String "dfu-util [0-9]"
} else {
    Write-Host ""
    Write-Host "NOTE: dfu-util not found in PATH" -ForegroundColor Yellow
    Write-Host "Firmware upload functionality may require manual dfu-util installation"
    Write-Host "You can download it from: http://dfu-util.sourceforge.net/"
}

# Launch the application
Write-Host ""
Write-Host "========================================"
Write-Host "  Launching DWM-Control..."
Write-Host "========================================"
Write-Host ""

try {
    python DWM-Control.py
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "ERROR: Failed to launch application" -ForegroundColor Red
    Write-Host $_.Exception.Message
    $exitCode = 1
}

# Check exit code
if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Application exited with error"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "If you encountered issues, please check:" -ForegroundColor Yellow
    Write-Host "1. All required packages are installed"
    Write-Host "2. Your device drivers are properly installed" 
    Write-Host "3. No other applications are using the same ports"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Application closed normally"
    Write-Host "========================================"
}

Write-Host ""
Read-Host "Press Enter to close this window"
