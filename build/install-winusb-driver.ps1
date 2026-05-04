# DWM Control - WinUSB Driver Installation
# Runs elevated (via UAC) during or after app installation.
# Installs WinUSB for DWM V2 DFU device: VID_0483 PID_DF11 ("DFU in FS Mode")

$InfPath = Join-Path $PSScriptRoot 'dwm-dfu-winusb.inf'

Write-Host ''
Write-Host 'DWM Control - WinUSB Driver Installation' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $InfPath)) {
    Write-Host "ERROR: INF file not found: $InfPath" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host "INF: $InfPath"
Write-Host ''
$pnputil = "$env:SystemRoot\System32\pnputil.exe"

Write-Host "Running: pnputil /add-driver ..."
Write-Host ''

$output = & $pnputil /add-driver $InfPath /install 2>&1
$exitCode = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }

Write-Host ''
if ($exitCode -eq 0) {
    Write-Host 'SUCCESS: WinUSB driver staged/installed.' -ForegroundColor Green
    Write-Host 'If the DFU device is already connected, unplug and replug it now.'
} else {
    Write-Host "FAILED with exit code $exitCode." -ForegroundColor Red
    Write-Host 'You can retry later from inside DWM Control via the Install USB Driver button.'
}

Write-Host ''
Read-Host 'Press Enter to close'
exit $exitCode
