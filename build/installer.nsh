; NSIS installer customization script
; This script runs during the Windows installer creation

!macro customInstall
  ; Create shortcuts
  CreateShortCut "$DESKTOP\DWM Control.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; --- WinUSB driver installation (optional, Yes by default) ---
  MessageBox MB_YESNO|MB_ICONQUESTION "Install WinUSB driver for DFU firmware updates?$\r$\n$\r$\nThis driver is required to upload firmware to the DWM V2 device.$\r$\nA User Account Control prompt will appear — click Yes to allow.$\r$\n$\r$\nInstall now?" IDNO skip_usb_driver

  ; Extract the bundled INF to a temp folder
  SetOutPath "$TEMP\dwm-winusb"
  File "${BUILD_RESOURCES_DIR}\dwm-dfu-winusb.inf"

  ; Write a small PowerShell helper that runs pnputil and keeps the window open
  FileOpen $R0 "$TEMP\dwm-winusb\install.ps1" w
  FileWrite $R0 "Write-Host 'DWM Control - WinUSB Driver Installation' -ForegroundColor Cyan$\r$\n"
  FileWrite $R0 "Write-Host '==========================================' -ForegroundColor Cyan$\r$\n"
  FileWrite $R0 "Write-Host ''$\r$\n"
  FileWrite $R0 "Write-Host 'Running: pnputil /add-driver ...'$\r$\n"
  FileWrite $R0 "$$out = & pnputil.exe /add-driver '$TEMP\dwm-winusb\dwm-dfu-winusb.inf' /install 2>&1$\r$\n"
  FileWrite $R0 "$$out | ForEach-Object { Write-Host $$_ }$\r$\n"
  FileWrite $R0 "Write-Host ''$\r$\n"
  FileWrite $R0 "if ($$LASTEXITCODE -eq 0) {$\r$\n"
  FileWrite $R0 "    Write-Host 'SUCCESS: Driver staged.' -ForegroundColor Green$\r$\n"
  FileWrite $R0 "    Write-Host 'Unplug and replug the DFU device if it is already connected.'$\r$\n"
  FileWrite $R0 "} else {$\r$\n"
  FileWrite $R0 "    Write-Host ""FAILED (exit code $$LASTEXITCODE)."" -ForegroundColor Red$\r$\n"
  FileWrite $R0 "    Write-Host 'You can install it later from inside DWM Control (Install USB Driver button).'$\r$\n"
  FileWrite $R0 "}$\r$\n"
  FileWrite $R0 "Write-Host ''$\r$\n"
  FileWrite $R0 "Read-Host 'Press Enter to close'$\r$\n"
  FileClose $R0

  ; Launch elevated PowerShell — UAC prompt appears here
  ExecShell "runas" "powershell.exe" '-ExecutionPolicy Bypass -NoProfile -File "$TEMP\dwm-winusb\install.ps1"' SW_SHOWNORMAL

  skip_usb_driver:
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$DESKTOP\DWM Control.lnk"
!macroend

; Custom header text
!define MUI_WELCOMEPAGE_TITLE "Welcome to the DWM Control Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of DWM Control.$\r$\n$\r$\nDWM Control is a cross-platform application for managing DWM V2 firmware updates and device communication.$\r$\n$\r$\nClick Next to continue."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "Completing the DWM Control Setup Wizard"
!define MUI_FINISHPAGE_TEXT "DWM Control has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN_TEXT "Run DWM Control"
