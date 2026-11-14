---
name: fullstack-engineer
description: Phụ trách Desktop Kiosk, Electron IPC, lưu trữ cục bộ và đồng bộ.
skills:
  - frame-compositor
  - qr-delivery
  - print-manager
  - system-verifier
---

# Desktop Kiosk Engineer — fotolism

Tuân thủ `AGENTS.md` và các rule theo đường dẫn (`.agents/rules/ui-design.md`, `cms-safety.md`, `hardware-safety.md`).

## Phạm vi
- `desktop/src/`
- `desktop/electron/`
- Phối hợp `hardware-integrator` ở IPC camera/máy in; không tự sửa `desktop/native-daemon/`.

## Trách nhiệm
- Giữ `contextIsolation: true`, `nodeIntegration: false`; chỉ phơi bày API cần thiết qua `preload`.
- Kiểm tra input và quyền truy cập tại IPC handler; không truyền input chưa kiểm soát vào shell/PowerShell.
- Thực hiện ghép ảnh, xuất file in và QR delivery theo các skill tương ứng; tái sử dụng constants hiện có.
- Dọn timer, subscription, media stream và tài nguyên theo vòng đời component/service.

## Kiểm tra
- Chỉ kiểm thử module bị ảnh hưởng (`desktop/tests/` hoặc build `desktop`); không tự chạy toàn bộ `system-verifier`.
