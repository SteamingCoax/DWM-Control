# DWM Control - Development Test Script (PowerShell)
# Run this script to test the application without building

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DWM Control - Development Test Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm is not available!" -ForegroundColor Red
    Write-Host "Please ensure Node.js is properly installed." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules folder not found. Installing dependencies..." -ForegroundColor Yellow
    Write-Host "This may take a few minutes..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        npm install
        Write-Host ""
        Write-Host "Dependencies installed successfully!" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "Dependencies already installed." -ForegroundColor Green
    Write-Host ""
}

Write-Host "Starting DWM Control application in development mode..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C in this window to stop the application." -ForegroundColor Yellow
Write-Host "Close the Electron window to exit normally." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start the application using the dev script
try {
    npm run dev
} catch {
    Write-Host ""
    Write-Host "Application encountered an error or was closed." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Application has been closed." -ForegroundColor Green
Read-Host "Press Enter to exit"
