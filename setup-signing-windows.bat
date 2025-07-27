@echo off
REM Windows code signing certificate setup script

echo ================================
echo DWM Control - Windows Signing Setup
echo ================================

echo This script will help you create a self-signed certificate for Windows code signing.
echo For production, consider purchasing a real code signing certificate.
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo [INFO] Creating self-signed certificate...

REM Create the certificate
powershell -Command "& {$cert = New-SelfSignedCertificate -DnsName 'DWM Control' -Type CodeSigning -CertStoreLocation 'cert:\CurrentUser\My' -Subject 'CN=DWM Control Developer' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048; Write-Host 'Certificate created with thumbprint:' $cert.Thumbprint}"

if %errorlevel% neq 0 (
    echo ERROR: Failed to create certificate
    pause
    exit /b 1
)

echo.
echo [INFO] Certificate created successfully!
echo.

REM Create certificates directory
if not exist "build\certificates" mkdir build\certificates

echo [INFO] To export the certificate for use with electron-builder:
echo 1. Open 'certmgr.msc' (Certificate Manager)
echo 2. Go to Personal ^> Certificates
echo 3. Find 'DWM Control' certificate
echo 4. Right-click ^> All Tasks ^> Export
echo 5. Choose 'Yes, export the private key'
echo 6. Select 'Personal Information Exchange (.pfx)'
echo 7. Set a password and save as 'build\certificates\dwm-control-cert.pfx'
echo.

echo [INFO] Then update your .env file with:
echo WIN_CSC_LINK=build/certificates/dwm-control-cert.pfx
echo WIN_CSC_KEY_PASSWORD=YourPassword
echo.

echo [SUCCESS] Windows signing setup completed!
pause
