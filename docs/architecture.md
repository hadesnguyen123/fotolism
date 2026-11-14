# FOTOLISM 3.0 — KIẾN TRÚC HỆ THỐNG & LUỒNG DỮ LIỆU

> Tài liệu tham chiếu kiến trúc dành cho Coding Agent (Antigravity/Cursor).
>
> **Mục tiêu:** Xác định ranh giới module, giao tiếp hệ thống, luồng dữ liệu và các nguyên tắc bất biến khi phát triển Fotolism 3.0.

## 1. Tổng quan hệ thống

Fotolism 3.0 gồm bốn phân hệ chính:

| Phân hệ | Thư mục | Công nghệ | Cổng cấu hình |
|---|---|---|---|
| Desktop Kiosk | `desktop/` | Electron, React 19, Zustand, Vite | `5173` |
| Canon Camera Daemon | `desktop/native-daemon/` | C#/.NET 64-bit, Canon EDSDK | `8899` |
| Cloud CMS / POS | `cms/` | Next.js 16, Supabase | `3000` |
| AI Beauty Engine | `desktop/ai-service/` | Python, FastAPI, OpenCV | `8000` |

**Nguyên tắc:**
- Mỗi dịch vụ sử dụng cổng cấu hình riêng, tránh xung đột.
- Không tự ý thay đổi cổng hoặc giao thức giao tiếp.
- Các cổng `5173` và `3000` cần được phân biệt với cấu hình production khi đóng gói và triển khai.
- Các dịch vụ cục bộ chỉ nên mở quyền truy cập mạng cần thiết.
- Không tự ý thay đổi kiến trúc hoặc chuyển trách nhiệm giữa các phân hệ.

## 2. Ranh giới trách nhiệm

### 2.1. Desktop Kiosk

- Điều khiển giao diện khách hàng và luồng phiên chụp.
- Hoạt động theo nguyên tắc offline-first.
- Quản lý trạng thái giao diện bằng Zustand.
- Giao tiếp chức năng hệ thống thông qua Electron IPC.
- Phối hợp chụp ảnh, xử lý ảnh, ghép khung và in ấn.

### 2.2. Canon Camera Daemon

- Độc quyền quản lý Canon EOS R100 thông qua EDSDK.
- Duy trì camera session trong suốt quá trình hoạt động.
- Cung cấp chức năng chụp ảnh, LiveView và quản lý trạng thái camera.
- Xử lý lệnh chụp tuần tự.
- Chống xử lý trùng lệnh dựa trên `captureId`.

**Bất biến:** Không tạo thêm thành phần độc lập cùng quản lý EDSDK session.

### 2.3. AI Beauty Engine

- Xử lý ảnh chân dung cục bộ.
- Cung cấp API xử lý ảnh qua FastAPI.
- Bảo toàn ảnh gốc và dữ liệu đầu vào.
- Không được khiến luồng chụp/in phụ thuộc hoàn toàn vào kết quả AI.
- Các thuật toán, model và dependency thực tế phải được xác minh từ source code.

### 2.4. Cloud CMS / POS

- Quản lý thiết bị, chi nhánh, cấu hình và nghiệp vụ thu ngân.
- Quản lý giao dịch tiền mặt và QR thông qua Sepay (hiện tại)
- Cung cấp API phục vụ đồng bộ Kiosk.
- Quản lý dữ liệu Cloud thông qua Supabase.
- Áp dụng xác thực và phân quyền theo phạm vi chi nhánh.

## 3. Kiến trúc Offline-First

### 3.1. Nguyên tắc hoạt động

Kiosk phải duy trì các chức năng cục bộ khi mất Internet:

- Hiển thị giao diện và chọn layout.
- Điều khiển camera và chụp ảnh.
- Lưu trữ phiên chụp và ảnh gốc.
- Xử lý ảnh bằng dịch vụ AI cục bộ khi khả dụng.
- Ghép khung và in ảnh.
- Ghi nhận các giao dịch offline được nghiệp vụ cho phép.

**Giới hạn:** Xác nhận chuyển khoản QR phụ thuộc vào kết nối với hệ thống thanh toán. Không được tự coi giao dịch QR là thành công khi chưa có xác nhận hợp lệ.

### 3.2. SQLite & Outbox

Dữ liệu phiên chụp và trạng thái đồng bộ được lưu cục bộ qua:

`desktop/electron/sessionDatabase.cts`

Các trạng thái đã mô tả:

- `pending`: Chưa đồng bộ thành công.
- `synced`: Đã đồng bộ thành công.

**Nguyên tắc đồng bộ:**

1. Lưu dữ liệu nghiệp vụ cục bộ trước khi đồng bộ Cloud.
2. Không làm mất dữ liệu khi mất Internet hoặc dịch vụ Cloud không khả dụng.
3. Chỉ đánh dấu `synced` sau khi nhận được kết quả xác nhận hợp lệ.
4. Cho phép retry an toàn khi đồng bộ thất bại.
5. Không tạo bản ghi nghiệp vụ trùng lặp khi gửi lại yêu cầu.

Cơ chế retry, backoff và lưu lỗi cụ thể phải được xác minh theo implementation hiện tại.

### 3.3. Idempotent Cloud Sync

Dịch vụ:

`desktop/src/services/cloudSyncService.ts`

Dữ liệu đồng bộ sử dụng các định danh nghiệp vụ phù hợp:

- `kiosk_id`
- `session_id`
- `transaction_id`

Cloud API phải sử dụng khóa định danh phù hợp để ngăn việc tạo trùng dữ liệu khi retry.

Không giả định chỉ cần gửi các trường định danh là đã bảo đảm idempotency; phía server phải thực thi kiểm tra hoặc ràng buộc tương ứng.

## 4. Giao tiếp giữa các phân hệ

### 4.1. Electron IPC

Electron sử dụng:

- `contextIsolation: true`
- `nodeIntegration: false`

Các API bridge được mô tả trong `preload.cts`:

- `camera`
- `printer`
- `session`
- `storage`
- `window`

Renderer chỉ được truy cập các chức năng hệ thống thông qua giao diện đã được cho phép.

Không mở rộng quyền Node.js trực tiếp cho Renderer.

### 4.2. Kiosk ↔ Canon Daemon

**Cổng:** `8899`

Các endpoint được mô tả:

| Endpoint | Chức năng |
|---|---|
| `/status` | Kiểm tra trạng thái camera |
| `/capture` | Yêu cầu chụp ảnh |
| `/reset` | Khôi phục trạng thái |
| `/wake` | Đánh thức camera |
| `/liveview` | MJPEG LiveView |

**Nguyên tắc:**
- Daemon là thành phần duy nhất sở hữu camera session.
- Không đóng/mở session sau mỗi lần chụp.
- Lệnh chụp phải được tuần tự hóa.
- Bảo toàn cơ chế chống trùng `captureId`.
- Kiểm tra đường gọi thực tế từ Renderer/Main Process trước khi thay đổi IPC hoặc HTTP API.

### 4.3. Kiosk ↔ AI Beauty Engine

**Cổng:** `8000`

- Kiosk gửi yêu cầu xử lý ảnh đến AI Service.
- AI Service xử lý và trả kết quả theo API hiện có.
- Ảnh gốc phải được bảo toàn.
- Khi AI thất bại, hệ thống phải có phương án tiếp tục phiên chụp bằng ảnh gốc hoặc ảnh đã xử lý hợp lệ trước đó.

Đường dẫn endpoint, cấu trúc payload và cơ chế timeout cần được xác minh từ source code.

### 4.4. Kiosk ↔ Cloud CMS

Các API đã được mô tả:

| Endpoint | Chức năng |
|---|---|
| `/api/kiosk/heartbeat` | Gửi trạng thái hoạt động |
| `/api/kiosk/config` | Đồng bộ cấu hình |
| `/api/kiosk/verify-pin` | Xác thực mã PIN |
| `/api/kiosk/sessions` | Đồng bộ phiên chụp |

**Nguyên tắc:**
- Giao tiếp Cloud có thể thất bại mà không làm mất dữ liệu cục bộ.
- API phải kiểm tra xác thực và quyền truy cập phù hợp.
- Dữ liệu theo chi nhánh phải được kiểm soát theo `branch_id`.
- Supabase RLS là một lớp bảo vệ dữ liệu, không thay thế việc kiểm tra quyền ở API.

## 5. Phân loại dịch vụ

### 5.1. Photobooth

Khách có thể bắt đầu từ Kiosk hoặc sử dụng mã PIN được cấp tại POS theo cấu hình nghiệp vụ.

Luồng chính:

1. Chọn dịch vụ và layout.
2. Thực hiện thanh toán hoặc xác thực quyền sử dụng theo cấu hình.
3. Chụp ảnh.
4. Chọn khung và bộ lọc.
5. Xác nhận ảnh.
6. Ghép ảnh, lưu trữ và in.
7. Đồng bộ Cloud khi có kết nối.

Thứ tự chi tiết phải tu