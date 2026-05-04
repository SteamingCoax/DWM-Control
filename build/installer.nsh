; NSIS installer customization script

!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\DWM Control.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Copy WinUSB driver files to the install directory
  SetOutPath "$INSTDIR"
  File "${BUILD_RESOURCES_DIR}\dwm-dfu-winusb.inf"
  File "${BUILD_RESOURCES_DIR}\install-winusb-driver.ps1"

  ; Ask the user — Yes is the default button
  MessageBox MB_YESNO|MB_ICONQUESTION "Install WinUSB driver for DFU firmware updates?$\r$\n$\r$\nThis driver is required to upload firmware to the DWM V2 device.$\r$\nA User Account Control prompt will appear — click Yes to allow.$\r$\n$\r$\nInstall now?" IDNO skip_driver

  ; Launch PowerShell elevated via UAC — runs install-winusb-driver.ps1
  ; $\" is NSIS syntax for an embedded literal double-quote character
  ExecShell "runas" "powershell.exe" "-ExecutionPolicy Bypass -NoProfile -File $\"$INSTDIR\install-winusb-driver.ps1$\""

  skip_driver:
!macroend

!macro customUnInstall
  Delete "$DESKTOP\DWM Control.lnk"
  Delete "$INSTDIR\dwm-dfu-winusb.inf"
  Delete "$INSTDIR\install-winusb-driver.ps1"
!macroend

; Welcome page
!define MUI_WELCOMEPAGE_TITLE "Welcome to the DWM Control Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of DWM Control.$\r$\n$\r$\nDWM Control is a cross-platform application for managing DWM V2 firmware updates and device communication.$\r$\n$\r$\nClick Next to continue."

; Finish page
!define MUI_FINISHPAGE_TITLE "Completing the DWM Control Setup Wizard"
!define MUI_FINISHPAGE_TEXT "DWM Control has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN_TEXT "Run DWM Control"
