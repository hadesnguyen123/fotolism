---
name: cms-backoffice
description: Hướng dẫn quản trị hệ thống Cloud CMS, giám sát mạng lưới Kiosks đa điểm, đồng bộ bảng giá, khung ảnh và kế toán đối soát doanh thu 3 bên Fotolism 3.0.
---

# ☁️ CMS Backoffice & Cloud Accounting Skill — Fotolism 3.0

Hướng dẫn chuẩn hóa quy trình quản trị mạng lưới máy Kiosk Photobooth phân tán từ xa thông qua nền tảng Cloud CMS tập trung của Fotolism.

---

## 1. Kiến Trúc Phân Vùng Mạng (Port Partitioning)

Để đảm bảo các phân hệ không xung đột tài nguyên mạng trên máy trạm hoặc máy chủ:

| Phân hệ | Cổng (Port) | Công nghệ | Nhiệm vụ chính |
| :--- | :---: | :--- | :--- |
| **Desktop Kiosk** | `5173` | Electron + React 19 + Vite | Giao diện màn hình cảm ứng khách hàng, điều khiển máy ảnh & in ấn |
| **Canon Camera Daemon** | `8899` | C#/.NET 64-bit Persistent Daemon | Quản lý độc quyền Canon EOS R100 EDSDK, MJPEG LiveView |
| **Cloud CMS Backoffice & API** | `3000` | Next.js 16 (App Router) + Supabase | Giao diện Web quản trị Kiosks, quầy thu ngân POS `/pos`, REST API `/api/kiosk/*` |
| **AI Enhance Service** | `8000` | Python FastAPI + OpenCV/GFPGAN | Tăng cường độ nét chân dung offline |

---

## 2. Các Luồng Dữ Liệu Đồng Bộ Kiosk ⇄ Cloud (Offline-First)

Mọi Kiosk đều hoạt động độc lập ngay cả khi mất mạng Internet. Khi có mạng trở lại, hệ thống tự động đẩy dữ liệu lên Cloud CMS:

```
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│       Máy Trạm Kiosk Cục Bộ     │               │          Cloud CMS Center       │
│ - SQLite Lưu trữ bền vững       │               │ - PostgreSQL / Supabase RLS     │
│ - Lưu Sessions, Captures, Prints│               │ - Web Dashboard Đa Điểm         │
└────────────────┬────────────────┘               └────────────────┬────────────────┘
                 │                                                 │
                 │ 1. Heartbeat mỗi 30s (Ping, Giấy in, Nhiệt độ)   │
                 ├────────────────────────────────────────────────►│
                 │                                                 │
                 │ 2. Kéo Cấu hình (Bảng giá, Mã giảm giá, Khung)  │
                 │◄────────────────────────────────────────────────┤
                 │                                                 │
                 │ 3. Đẩy Giao dịch & Lịch sử phiên chụp hoàn tất   │
                 ├────────────────────────────────────────────────►│
                 │                                                 │
                 │ 4. Đối soát kế toán 3 bên tự động               │
                 │◄───────────────────────────────────────────────►│
```

---

## 3. Danh Mục API Kiosk ⇄ CMS Chuẩn (Port 3000)

| Endpoint | Method | Chức năng | Chi tiết Payload |
| :--- | :--- | :--- | :--- |
| `http://localhost:3000/api/kiosks` | `GET` | Lấy danh sách toàn bộ Kiosks | Trả về ID máy, tên cơ sở, trạng thái online, định mức giấy còn lại |
| `http://localhost:3000/api/kiosk/heartbeat` | `POST` | Kiosk gửi nhịp tim định kỳ | `{"kiosk_id": string, "paperRemaining": int, "appVersion": string, "printer_status": string}` |
| `http://localhost:3000/api/pricing` | `GET` | Đồng bộ bảng giá gói chụp | Gói 2x6 strip, gói 4x6 đơn, phí in thêm bản copy |
| `http://localhost:3000/api/kiosk/sessions` | `POST` | Đẩy phiên chụp & giao dịch hoàn tất | `{"session_code": string, "kiosk_id": string, "amount": int, "payment_method": "vietqr"|"cash"}` |
| `http://localhost:3000/api/kiosk/tickets` | `GET/POST` | Quản lý vé chụp & hàng chờ POS | Cấp mã PIN 4 số, dịch vụ Photobooth / Selfbooth |
| `http://localhost:3000/api/kiosk/payments/check` | `GET` | Thăm dò giao dịch SePay/VietQR tức thì | `?orderCode=FTL######&amount=######` |
| `http://localhost:3000/api/reconciliation` | `GET` | Báo cáo đối soát 3 góc | Đối chiếu: Doanh thu VietQR ngân hàng ⇄ Tiền mặt nhân viên nộp ⇄ Số lượng giấy in tiêu hao |

---

## 4. Quy Trình Đối Soát Kế Toán 3 Bên (3-Way Reconciliation)

1. **Góc 1: Doanh thu Ngân hàng (VietQR MBBank / SePay / Casso)**:
   - Dữ liệu Webhook tự động biến động số dư tài khoản ngân hàng.
2. **Góc 2: Tiền mặt tại Kiosk (Cash Collector / POS Counter)**:
   - Số tiền mặt khách đưa nhân viên hoặc nạp vào đầu đọc tiền mặt tự động, ghi nhận kênh `manual_cash`.
3. **Góc 3: Giấy in tiêu hao thực tế (Hardware Spooler Audit)**:
   - Số lượt máy in nhiệt DNP/HiTi đã cắt giấy thật qua lệnh phần cứng.
4. **Phát hiện gian lận (Discrepancy Alarm)**:
   - Công thức: `Tổng tiền ghi nhận = (Số lượt in thực tế × Đơn giá gói) - Khấu trừ Voucher hợp lệ`.
   - Nếu chênh lệch (Delta) > 0: Hệ thống tự động gắn cờ đỏ cảnh báo gian lận hoặc thất thoát giấy in để quản lý cơ sở kiểm tra camera an ninh.
