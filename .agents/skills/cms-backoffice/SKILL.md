---
name: cms-backoffice
description: Hướng dẫn quản trị hệ thống Cloud CMS, giám sát mạng lưới Kiosks đa điểm, đồng bộ bảng giá, khung ảnh và kế toán đối soát doanh thu 3 bên Fotolism 3.0.
---

# CMS Backoffice & Cloud Accounting Skill — Fotolism 3.0

Tuân thủ `AGENTS.md` và `.agents/rules/cms-safety.md` (bắt buộc Supabase RLS theo `branch_id`, đồng bộ idempotent, hỏi trước khi sửa đối soát/VietQR/migrations).

## 1. Phân vùng cổng mạng (Port Partitioning)

| Phân hệ | Cổng | Công nghệ | Vai trò |
| :--- | :---: | :--- | :--- |
| **Desktop Kiosk** | `5173` | Electron + React 19 + Vite | UI cảm ứng, điều khiển camera & in ấn |
| **Canon Camera Daemon** | `8899` | C#/.NET 64-bit | Độc quyền Canon EDSDK, MJPEG LiveView |
| **Cloud CMS & API** | `3000` | Next.js 16 + Supabase | Quản trị Kiosks, POS `/pos`, `/api/kiosk/*` |
| **AI Enhance Service** | `8000` | Python FastAPI + OpenCV | Làm đẹp chân dung offline |

## 2. Luồng đồng bộ Kiosk ⇄ Cloud (Offline-First)

1. **Heartbeat (30s)**: Kiosk gửi ping, giấy in còn lại, trạng thái máy in.
2. **Pull Config**: Kéo bảng giá, mã giảm giá, khung ảnh từ CMS.
3. **Outbox Push**: Lưu SQLite cục bộ trước; khi có mạng đẩy phiên chụp & giao dịch idempotent (`kiosk_id`, `session_id`, `transaction_id`).

## 3. API Kiosk ⇄ CMS (`http://localhost:3000`)

| Endpoint | Method | Chức năng | Payload / Tham số |
| :--- | :---: | :--- | :--- |
| `/api/kiosks` | `GET` | Danh sách Kiosks | ID máy, cơ sở, trạng thái online, giấy còn lại |
| `/api/kiosk/heartbeat` | `POST` | Nhịp tim định kỳ | `{"kiosk_id", "paperRemaining", "appVersion", "printer_status"}` |
| `/api/pricing` | `GET` | Đồng bộ bảng giá | Gói `2x6`, `4x6`, phí in thêm |
| `/api/kiosk/sessions` | `POST` | Đẩy phiên chụp hoàn tất | `{"session_code", "kiosk_id", "amount", "payment_method": "vietqr"\|"cash"}` |
| `/api/kiosk/tickets` | `GET/POST` | Vé chụp & hàng chờ POS | Cấp PIN 4 số, Photobooth / Selfbooth |
| `/api/kiosk/payments/check` | `GET` | Thăm dò giao dịch VietQR | `?orderCode=FTL######&amount=######` |
| `/api/reconciliation` | `GET` | Báo cáo đối soát 3 bên | VietQR ngân hàng ⇄ Tiền mặt ⇄ Giấy in tiêu hao |

## 4. Đối soát kế toán 3 bên (`cms/src/lib/reconciliation/engine.ts`)

- **3 nguồn đối chiếu**: (1) Webhook ngân hàng (VietQR / SePay / Casso), (2) Tiền mặt tại quầy/máy (`manual_cash`), (3) Số lượt cắt giấy thực tế từ Hardware Spooler (`PrintJobs`).
- **Công thức phát hiện lệch (Discrepancy Alarm)**: `Tổng tiền ghi nhận = (Số lượt in thực tế × Đơn giá gói) - Khấu trừ Voucher hợp lệ`. Nếu `Delta > 0` → gắn cờ đỏ cảnh báo thất thoát/gian lận.
