---
trigger: glob
globs: "{desktop/native-daemon/**,desktop/electron/**,desktop/src/services/camera*,desktop/src/services/print*}"
description: Quy chuẩn an toàn phần cứng Canon EDSDK Persistent Daemon và Spooler máy in nhiệt DNP/HiTi.
---

# FOTOLISM 3.0 — HARDWARE SAFETY & LIFECYCLE RULES

Quy chuẩn bất biến bảo vệ phần cứng máy ảnh Canon EOS R100, máy in nhiệt dye-sub và ngăn ngừa sự cố vật lý tại buồng Kiosk.

---

## 1. Vòng Đời Canon EDSDK & Tiến Trình Persistent Daemon

* **Tiến trình độc quyền Cổng 8899**:
  * Duy nhất tiến trình C# 64-bit `fotolism_canon_daemon.exe` mở session máy ảnh qua Canon EDSDK trên cổng `127.0.0.1:8899`.
  * Tuyệt đối không cho phép Electron Renderer, script ngoài (PowerShell, CLI) hoặc phần mềm thứ ba (EOS Utility) tranh chấp kết nối USB.
* **Cấm đóng session bừa bãi (Session Persistence)**:
  * **TUYỆT ĐỐI KHÔNG** gọi `EdsCloseSession()` hoặc `EdsTerminateSDK()` trong khối `finally` sau mỗi lần chụp.
  * Session máy ảnh phải được duy trì liên tục xuyên suốt thời gian Kiosk hoạt động. Đóng/mở session liên tục sẽ gây treo bus USB và crash phần cứng.
* **Electron Supervisor**:
  * Electron Main Process giám sát tiến trình daemon (`/status`), tự động khởi chạy ngầm khi thiếu và graceful shutdown (`/quit`) khi tắt Kiosk.

---

## 2. Hàng Đợi Lệnh Đơn STA & Chống Chụp Trùng ("Tách Tách")

* **Single-Threaded Apartment (STA) Command Queue**:
  * Toàn bộ lệnh tương tác với EDSDK (Live View, Shutter, Lấy ảnh) phải chạy trên Single Thread STA.
* **Idempotent Capture ID**:
  * Mọi lệnh chụp bắt buộc gửi kèm payload chuẩn: `{ captureId, sessionId, slotIndex }`.
  * Nếu daemon nhận lệnh với `captureId` đã tồn tại trong bộ nhớ cache, daemon trả về ngay ảnh đã lưu mà **tuyệt đối không kích hoạt màn trập vật lý lần thứ 2**.

---

## 3. Quản Lý Spooler Máy In Nhiệt Dye-Sub (DNP RX1HS / HiTi P525L)

* **Chế độ cắt dao 2-inch cut**:
  * Máy in DNP in khổ 4x6 và dùng dao cắt đôi thành 2 dải strip 2x6.
  * Luôn đảm bảo số lượng bản in dải strip là số chẵn (bước nhảy +2 bản) để tránh kẹt giấy hoặc lãng phí cuộn mực/giấy.
* **Kiểm tra trạng thái máy in trước khi gửi lệnh**:
  * Kiểm tra trạng thái máy in (hết giấy, hết ruy băng mực, kẹt giấy) qua Windows Spooler API trước khi trừ lượt in của khách.
  * Không gửi dồn dập nhiều lệnh in lớn cùng lúc vào Spooler khi máy in đang bận.

