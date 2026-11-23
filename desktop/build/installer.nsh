; Fotolism Kiosk NSIS Installer Custom Script
; Thêm bước xác nhận chế độ cài đặt (Photobooth hoặc Selfbooth) và lưu vào resources\kiosk-mode.json

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  Var KioskModeDialog
  Var RadioPhotobooth
  Var RadioSelfbooth
  Var SelectedKioskMode

  !macro customInit
    StrCpy $SelectedKioskMode "photobooth"
  !macroend

  !macro customPageAfterChangeDir
    Page custom KioskModePageCreate KioskModePageLeave

    Function KioskModePageCreate
      !insertmacro MUI_HEADER_TEXT "Xác nhận chế độ Kiosk" "Chọn chế độ hoạt động cho máy Kiosk sẽ cài đặt"

      nsDialogs::Create 1018
      Pop $KioskModeDialog
      ${If} $KioskModeDialog == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 8u 100% 24u "Vui lòng xác nhận máy này sẽ cài đặt phần mềm ở chế độ nào:"
      Pop $0

      ${NSD_CreateRadioButton} 12u 40u 100% 14u "Photobooth — Màn hình ngang 16:9, chụp tự động theo khung"
      Pop $RadioPhotobooth

      ${NSD_CreateRadioButton} 12u 62u 100% 14u "Selfbooth — Màn hình dọc 9:16, Live View 3:4, chụp theo thời gian"
      Pop $RadioSelfbooth

      ${NSD_CreateLabel} 0 96u 100% 30u "Lựa chọn này sẽ được lưu vào cấu hình cài đặt (kiosk-mode.json). Bạn có thể chạy lại bộ cài để thay đổi chế độ sau này."
      Pop $0

      ${If} $SelectedKioskMode == "selfbooth"
        ${NSD_Check} $RadioSelfbooth
      ${Else}
        ${NSD_Check} $RadioPhotobooth
      ${EndIf}

      nsDialogs::Show
    FunctionEnd

    Function KioskModePageLeave
      ${NSD_GetState} $RadioSelfbooth $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $SelectedKioskMode "selfbooth"
      ${Else}
        StrCpy $SelectedKioskMode "photobooth"
      ${EndIf}
    FunctionEnd
  !macroend

  !macro customInstall
    CreateDirectory "$INSTDIR\resources"
    ; Khi Auto-Update cài âm thầm (/S), trang chọn chế độ bị bỏ qua nên giữ nguyên kiosk-mode.json sẵn có
    ; để tránh ghi đè nhầm máy Selfbooth về photobooth. Chỉ ghi mới nếu cài tương tác hoặc chưa có file.
    ${If} ${Silent}
      ${IfNot} ${FileExists} "$INSTDIR\resources\kiosk-mode.json"
        FileOpen $0 "$INSTDIR\resources\kiosk-mode.json" w
        FileWrite $0 '{"captureMode":"$SelectedKioskMode"}'
        FileClose $0
      ${EndIf}
    ${Else}
      FileOpen $0 "$INSTDIR\resources\kiosk-mode.json" w
      FileWrite $0 '{"captureMode":"$SelectedKioskMode"}'
      FileClose $0
    ${EndIf}
  !macroend
!endif

!macro customUnInstall
  Delete "$INSTDIR\resources\kiosk-mode.json"
!macroend
