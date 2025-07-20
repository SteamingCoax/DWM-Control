# PowerShell build script for libwdi.dll
# This script automatically finds Visual Studio and builds libwdi

Write-Host "Building libwdi for DWM-Control..." -ForegroundColor Green

# Function to find Visual Studio installation
function Find-VisualStudio {
    $vsPaths = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\Common7\Tools\VsDevCmd.bat",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Professional\Common7\Tools\VsDevCmd.bat",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Enterprise\Common7\Tools\VsDevCmd.bat"
    )
    
    foreach ($path in $vsPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    return $null
}

# Check if MSBuild is already available
$msbuild = Get-Command msbuild -ErrorAction SilentlyContinue
if (-not $msbuild) {
    Write-Host "MSBuild not found, searching for Visual Studio..." -ForegroundColor Yellow
    
    $vsDevCmd = Find-VisualStudio
    if (-not $vsDevCmd) {
        Write-Host "Error: Could not find Visual Studio installation" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please install Visual Studio with C++ build tools:" -ForegroundColor Yellow
        Write-Host "1. Download Visual Studio Community (free) from:"
        Write-Host "   https://visualstudio.microsoft.com/downloads/"
        Write-Host "2. During installation, select 'Desktop development with C++' workload"
        Write-Host "3. Run this script again"
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Write-Host "Found Visual Studio at: $vsDevCmd" -ForegroundColor Green
    Write-Host "Setting up build environment..." -ForegroundColor Yellow
    
    # Create a batch file to setup environment and build
    $buildScript = @"
@echo off
call "$vsDevCmd"
cd Programs\libwdi
msbuild libwdi.sln /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v143 /verbosity:minimal
"@
    
    $buildScript | Out-File -FilePath "temp_build.bat" -Encoding ASCII
    
    # Execute the build
    $result = Start-Process -FilePath "temp_build.bat" -Wait -PassThru
    Remove-Item "temp_build.bat" -ErrorAction SilentlyContinue
    
    if ($result.ExitCode -ne 0) {
        Write-Host "Build failed with exit code: $($result.ExitCode)" -ForegroundColor Red
        exit $result.ExitCode
    }
} else {
    Write-Host "MSBuild found, building directly..." -ForegroundColor Green
    
    # Check if libwdi solution exists
    if (-not (Test-Path "Programs\libwdi\libwdi.sln")) {
        Write-Host "Error: Programs\libwdi\libwdi.sln not found" -ForegroundColor Red
        Write-Host "Make sure you're running this from the DWM-Control directory" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    # Build directly
    Set-Location "Programs\libwdi"
    & msbuild libwdi.sln /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v143 /verbosity:minimal
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed" -ForegroundColor Red
        Set-Location "..\..\"
        Read-Host "Press Enter to exit"
        exit $LASTEXITCODE
    }
    
    Set-Location "..\..\"
}

# Check for the built DLL
$dllPath = "Programs\libwdi\libwdi\.msvc\x64\Release\dll\libwdi.dll"
if (Test-Path $dllPath) {
    Write-Host "Success! Built libwdi.dll" -ForegroundColor Green
    Write-Host ""
    Write-Host "Copying DLL to Programs folder..." -ForegroundColor Yellow
    
    Copy-Item $dllPath "Programs\libwdi.dll" -Force
    
    if (Test-Path "Programs\libwdi.dll") {
        Write-Host "libwdi.dll copied successfully to Programs folder!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The seamless driver installation feature is now available." -ForegroundColor Cyan
        Write-Host "Your DWM-Control application will automatically use libwdi" -ForegroundColor Cyan
        Write-Host "for driver installation when needed." -ForegroundColor Cyan
    } else {
        Write-Host "Warning: Failed to copy DLL to Programs folder" -ForegroundColor Yellow
        Write-Host "You can manually copy from: $dllPath" -ForegroundColor Yellow
    }
} else {
    Write-Host "Warning: libwdi.dll not found at expected location" -ForegroundColor Yellow
    Write-Host "Expected: $dllPath" -ForegroundColor Yellow
    Write-Host "Please check the build output above for errors" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Read-Host "Press Enter to continue"
