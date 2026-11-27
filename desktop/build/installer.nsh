; Fotolism Kiosk NSIS Installer Custom Script
; Thêm bước xác nhận chế độ cài đặt (Photobooth hoặc Selfbooth) và lưu bền vững vào
; resources\kiosk-mode.json + %APPDATA%\fotolism-desktop\kiosk-mode.json để không bị reset khi Auto-Update.

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  Var KioskModeDialog
  Var RadioPhotobooth
  Var RadioSelfbooth
  Var SelectedKioskMode
  Var KioskModeFilePath
  Var KioskModeFileContent
  Var KioskModeIdx
  Var KioskModeLen
  Var KioskModeSlice

  ; Đọc file kiosk-mode.json (nếu tồn tại) và cập nhật $SelectedKioskMode theo nội dung bên trong
  Function TryReadKioskModeFile
    Pop $KioskModeFilePath
    ${IfNot} ${FileExists} "$KioskModeFilePath"
      Return
    ${EndIf}

    ClearErrors
    FileOpen $0 "$KioskModeFilePath" r
    ${If} ${Errors}
      Return
    ${EndIf}
    FileRead $0 $KioskModeFileContent
    FileClose $0

    ; Tìm chuỗi "selfbooth" (9 ký tự)
    StrLen $KioskModeLen $KioskModeFileContent
    StrCpy $KioskModeIdx 0
    ${DoWhile} $KioskModeIdx < $KioskModeLen
      StrCpy $KioskModeSlice $KioskModeFileContent 9 $KioskModeIdx
      ${If} $KioskModeSlice == "selfbooth"
        StrCpy $SelectedKioskMode "selfbooth"
        Return
      ${EndIf}
      StrCpy $KioskModeSlice $KioskModeFileContent 10 $KioskModeIdx
      ${If} $KioskModeSlice == "photobooth"
        StrCpy $SelectedKioskMode "photobooth"
        Return
      ${EndIf}
      IntOp $KioskModeIdx $KioskModeIdx + 1
    ${Loop}
  FunctionEnd

  !macro customInit
    StrCpy $SelectedKioskMode "photobooth"
    ; Đọc sẵn chế độ cũ TRƯỚC khi uninstaller dọn $INSTDIR khi update:
    ; ưu tiên bản sao bền vững trong %APPDATA%\fotolism-desktop, sau đó %APPDATA%\fotolism và $INSTDIR\resources.
    Push "$INSTDIR\resources\kiosk-mode.json"
    Call TryReadKioskModeFile
    Push "$APPDATA\fotolism\kiosk-mode.json"
    Call TryReadKioskModeFile
    Push "$APPDATA\fotolism-desktop\kiosk-mode.json"
    Call TryReadKioskModeFile
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
    CreateDirectory "$APPDATA\fotolism-desktop"

    ; Ghi chế độ vào cả resources\kiosk-mode.json lẫn bản sao bền vững ở %APPDATA%\fotolism-desktop\kiosk-mode.json.
    ; Khi Auto-Update cài âm thầm (/S), $SelectedKioskMode đã được nạp lại từ bản cũ ở customInit nên không bị reset về photobooth.
    FileOpen $0 "$INSTDIR\resources\kiosk-mode.json" w
    FileWrite $0 '{"captureMode":"$SelectedKioskMode"}'
    FileClose $0

    FileOpen $0 "$APPDATA\fotolism-desktop\kiosk-mode.json" w
    FileWrite $0 '{"captureMode":"$SelectedKioskMode"}'
    FileClose $0
  !macroend
!endif

!macro customUnInstall
  ; Chỉ xóa resources\kiosk-mode.json khi gỡ cài đặt hẳn; giữ nguyên khi đang Auto-Update/nâng cấp
  ${ifNot} ${isUpdated}
    Delete "$INSTDIR\resources\kiosk-mode.json"
  ${endIf}
!macroend
