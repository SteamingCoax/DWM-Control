; NSIS installer customization script
; This script runs during the Windows installer creation

!macro customInstall
  ; Create shortcuts
  CreateShortCut "$DESKTOP\DWM Control.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  
  ; Associate with file types if needed
  ; WriteRegStr HKCR ".dwm" "" "DWMControlFile"
  ; WriteRegStr HKCR "DWMControlFile" "" "DWM Control File"
  ; WriteRegStr HKCR "DWMControlFile\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$DESKTOP\DWM Control.lnk"
  
  ; Remove file associations if they were created
  ; DeleteRegKey HKCR ".dwm"
  ; DeleteRegKey HKCR "DWMControlFile"
!macroend

; Custom header text
!define MUI_WELCOMEPAGE_TITLE "Welcome to the DWM Control Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of DWM Control.$\r$\n$\r$\nDWM Control is a cross-platform application for managing DWM V2 firmware updates and device communication.$\r$\n$\r$\nClick Next to continue."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "Completing the DWM Control Setup Wizard"
!define MUI_FINISHPAGE_TEXT "DWM Control has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN_TEXT "Run DWM Control"
