---
trigger: glob
globs: "{desktop/native-daemon/**,desktop/electron/**,desktop/src/services/camera*,desktop/src/services/print*}"
description: Quy chuẩn an toàn phần cứng Canon EDSDK Persistent Daemon và Spooler máy in nhiệt DNP/HiTi.
---

# FOTOLISM 3.0 — HARDWARE SAFETY RULES

1. **Canon EDSDK Persistent Daemon (`127.0.0.1:8899`)**:
   - Duy nhất `fotolism_canon_daemon.exe` (C# 64-bit) mở session máy ảnh qua Canon EDSDK; cấm Electron Renderer, script ngoài hoặc phần mềm thứ ba (EOS Utility, OBS...) tranh chấp cổng USB.
   - **Cấm gọi `EdsCloseSession()` / `EdsTerminateSDK()` trong `finally` sau mỗi lần chụp**; duy trì session liên tục để tránh treo USB và crash phần cứng.
   - Electron Main giám sát qua `/status`, tự khởi chạy khi thiếu và graceful shutdown qua `/quit`.
2. **STA Command Queue & Idempotency**:
   - Mọi lệnh EDSDK (Live View, Shutter, lấy ảnh) chạy tuần tự trên Single Thread STA.
   - Mọi lệnh chụp gửi kèm `{ captureId, sessionId, slotIndex }`; trùng `captureId` trả về ảnh đã lưu, **tuyệt đối không kích hoạt màn trập lần 2**.
3. **Spooler Máy In Nhiệt (DNP RX1HS / HiTi P525L)**:
   - Chế độ cắt đôi 2-inch cut (4x6 → 2 dải 2x6): số lượng dải strip phải là số chẵn (bước nhảy +2) để tránh kẹt/lãng phí giấy.
   - Kiểm tra trạng thái máy in (hết giấy, hết mực, kẹt giấy) qua Windows Spooler trước khi trừ lượt in; không đẩy dồn dập nhiều lệnh lớn khi máy in đang bận.
