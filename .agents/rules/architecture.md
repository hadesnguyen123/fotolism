---
trigger: always_on
description: Kiến trúc hệ thống tổng thể, phân vùng cổng mạng độc lập, mô hình Offline-First và ranh giới các module Fotolism 3.0.
---

# FOTOLISM 3.0 — SYSTEM ARCHITECTURE & MODULE BOUNDARIES

Tài liệu quy chuẩn kiến trúc hệ thống, phân vùng cổng mạng độc lập và luồng dữ liệu cho toàn bộ hệ sinh thái Fotolism Photobooth Suite.

---

## 1. Bản Đồ Phân Vùng Hệ Thống & Cổng Mạng (Port Partitioning)

Mỗi phân hệ chạy độc lập trên cổng riêng biệt, tuyệt đối không dùng chung hay thay đổi cổng:

| Phân hệ | Thư mục | Công nghệ | Cổng (Port) | Nhiệm vụ chính |
| :--- | :--- | :--- | :---: | :--- |
| **Desktop Kiosk** | `desktop/` | Electron + React 19 + Zustand + Vite | **`5173`** | Giao diện cảm ứng Touch-First cho khách, kết nối phần cứng, điều khiển in |
| **Canon Camera Daemon** | `desktop/native-daemon/` | C#/.NET 64-bit Persistent Daemon | **`8899`** | Độc quyền kết nối Canon EOS R100 qua EDSDK, phát MJPEG LiveView |
| **Cloud CMS Backoffice** | `cms/` | Next.js 16 (App Router) + Supabase | **`3000`** | Quản trị thiết bị, quầy thu ngân `/pos`, đối soát doanh thu VietQR/tiền mặt |
| **AI Beauty Engine** | `desktop/ai-service/` | Python FastAPI + OpenCV / GFPGAN | **`8000`** | Làm đẹp chân dung 24MP offline cho bản in cao cấp |

---

## 2. Mô Hình Dữ Liệu Offline-First & Outbox Sync

* **100% Khả dụng Offline**: Mọi luồng chính tại Kiosk (chọn layout, chụp ảnh, thanh toán tiền mặt/QR nội bộ, ghép khung, in ảnh) phải hoạt động trơn tru ngay cả khi ngắt kết nối Internet.
* **SQLite Outbox Pattern**:
  * Các phiên chụp, ảnh chụp và giao dịch được ghi nhận cục bộ vào SQLite (`sessionDatabase.cts`).
  * Trạng thái đồng bộ được theo dõi qua cờ `sync_status: 'pending' | 'synced'`.
* **Idempotent Cloud Sync**:
  * Dịch vụ đồng bộ (`cloudSyncService.ts`) tự động đẩy dữ liệu lên Cloud CMS khi có Internet.
  * Mọi payload đều đính kèm `kiosk_id`, `session_id`, `transaction_id` để CMS xử lý Idempotent Upsert mà không lo trùng lặp.

---

## 3. Ranh Giới Giao Tiếp Module (Module Boundaries)

* **Electron IPC Bridge**:
  * Bảo vệ giao diện khách bằng `contextIsolation: true`, `nodeIntegration: false`.
  * Chỉ phơi bày các API bridge cần thiết trong `preload.cts`: `camera`, `printer`, `session`, `storage`, `window`.
* **Kiosk ⇄ Canon Daemon (Port 8899)**:
  * Renderer và Main Process giao tiếp với daemon qua HTTP REST (`/status`, `/capture`, `/reset`) và MJPEG stream (`/liveview`).
* **CMS REST API (`/api/kiosk/*`)**:
  * Endpoint nhận nhịp tim heartbeat (`/api/kiosk/heartbeat`), đồng bộ cấu hình (`/api/kiosk/config`), xác thực mã PIN (`/api/kiosk/verify-pin`).
  * Thực thi bảo mật Supabase RLS theo `branch_id`.

---

## 4. Phân Loại Dịch Vụ (Service Classification)

* **Photobooth**:
  * Khách nhận mã PIN từ quầy thu ngân `/pos` hoặc bắt đầu trực tiếp tại buồng chụp.
  * Quy trình tự phục vụ hoàn toàn tại Kiosk (chọn khung, chụp, thanh toán, in).
* **Selfbooth**:
  * Khách trải nghiệm không gian chụp tự do tại Studio.
  * Thanh toán trực tiếp tại quầy thu ngân POS: tiền mặt (`manual_cash`) hoặc chuyển khoản VietQR kèm cơ chế polling callback tự động.

