---
name: qr-delivery
description: Hướng dẫn tạo mã QR tức thì cho khách quét tải ảnh và video timelapse về điện thoại (hỗ trợ Online Cloudflare R2 và Offline LAN Hotspot) cho Fotolism 3.0.
---

# 📱 QR Delivery Skill — Fotolism 3.0

Chuẩn hóa quy trình phân phối ảnh chụp, ảnh composite và video hậu trường (Timelapse) đến điện thoại khách hàng thông qua mã QR trên màn hình [ReviewScreen](file:///f:/Fotolism/desktop/src/screens/ReviewScreen.tsx).

---

## 1. Hai Chế Độ Phân Phối Ảnh Độc Lập

1. **Online Cloud (Cloudflare R2 + Gallery)**:
   - Electron Main Process xếp hàng tác vụ upload vào bảng SQLite `UploadTasks` (`sessionDatabase.cts`).
   - Worker nền [r2UploadWorker.cts](file:///f:/Fotolism/desktop/electron/r2UploadWorker.cts) lấy presigned URL từ CMS và tải ảnh gốc, ảnh composite (`is_final = 1`), và timelapse lên Cloudflare R2.
   - Hỗ trợ retry tự động (`PENDING` → `UPLOADING` → `UPLOADED` / `FAILED_RETRYABLE`) mà không chặn thao tác in ảnh của khách.
   - Tạo mã QR dẫn tới trang gallery công khai của phiên chụp bằng thư viện `qrcode`.
2. **Offline LAN Hotspot (Không cần Internet)**:
   - Khi mất mạng, Kiosk phát WiFi Hotspot nội bộ và phục vụ file trực tiếp qua HTTP server nội bộ trên mạng LAN để khách quét QR tải ngay tại quầy.

---

## 2. Nguyên Tắc Bất Biến
- **Offline-First**: Lỗi mạng hoặc upload R2 chậm không bao giờ được làm treo màn hình `ReviewScreen` hoặc chặn lệnh in.
- **Bảo toàn ảnh gốc**: Upload song song hoặc nối tiếp qua `UploadTasks` mà không ghi đè ảnh gốc trong thư mục phiên chụp.
