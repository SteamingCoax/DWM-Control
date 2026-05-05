; NSIS installer customization script

!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\DWM Control.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Bundle Zadig (pre-signed WinUSB driver installer tool)
  SetOutPath "$INSTDIR"
  File "${BUILD_RESOURCES_DIR}\zadig.exe"

  ; Ask the user if they want to install the USB driver now
  MessageBox MB_YESNO|MB_ICONQUESTION "Install WinUSB driver for DFU firmware updates?$\r$\n$\r$\nThis will open Zadig, a free driver installation tool.$\r$\nSet the DWM to DFU mode by navigating to Main Menu->Configure->Update->Yes. Connect the DWM to your computer via USB.$\r$\nIn Zadig: select 'DFU in FS Mode', choose WinUSB, and click Install Driver.$\r$\n$\r$\nOpen Zadig now? You can always do this later." IDNO skip_driver

  ; Launch Zadig — it requests its own elevation via its manifest
  ExecShell "open" "$INSTDIR\zadig.exe"

  skip_driver:
!macroend

!macro customUnInstall
  Delete "$DESKTOP\DWM Control.lnk"
  Delete "$INSTDIR\zadig.exe"
!macroend

; Welcome page
!define MUI_WELCOMEPAGE_TITLE "Welcome to the DWM Control Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of DWM Control.$\r$\n$\r$\nDWM Control is a cross-platform application for managing DWM V2 firmware updates and device communication.$\r$\n$\r$\nClick Next to continue."

; Finish page
!define MUI_FINISHPAGE_TITLE "Completing the DWM Control Setup Wizard"
!define MUI_FINISHPAGE_TEXT "DWM Control has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN_TEXT "Run DWM Control"
