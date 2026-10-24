# 📷 FOTOLISM — TÀI LIỆU KIẾN TRÚC HỆ THỐNG & HƯỚNG DẪN VẬN HÀNH
> **Hệ sinh thái:** Fotolism AI-Powered Photobooth Suite  
> **Phiên bản:** 2.1 (Canon EDSDK Persistent Daemon & Pure Camera Edition)  
> **Cập nhật gần nhất:** 24/10/2026  
> **Ngôn ngữ:** Tiếng Việt  

---

## 🏛️ 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Fotolism được thiết kế theo mô hình **Desktop Hybrid Micro-Services (Offline-First, Zero-Lag & Hardware-Direct)**: kết hợp giao diện cảm ứng Kiosk thời thượng của **React 19 + Vite**, nhân điều khiển phần cứng của **Electron Shell (Node.js)**, và tiến trình chạy ngầm chuyên dụng **Fotolism Canon Daemon (C# 64-bit)** giao tiếp trực tiếp với thư viện gốc **Canon EDSDK 64-bit** qua cáp USB PTP tốc độ cao.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   MÀN HÌNH CẢM ỨNG KIOSK FOTOLISM (TOUCH SCREEN)                       │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    ELECTRON SHELL RUNTIME (DESKTOP)                              │  │
│  │                                                                                  │  │
│  │  ┌─────────────────────────────────┐      ┌───────────────────────────────────┐  │  │
│  │  │      Renderer Process (UI)      │      │       Main Process (Supervisor)   │  │  │
│  │  │  - React 19 + TypeScript + Vite │      │  - Kiosk / Window Management      │  │  │
│  │  │  - Zustand Global Store         │◄────►│  - Preload ContextIsolation Bridge│  │  │
│  │  │  - Photobooth & Selfbooth Modes │ IPC  │  - Canon Daemon Watchdog Spawner  │  │  │
│  │  │  - BeautyCameraView (WebGL)     │      │  - Hardware Shutter Lock (await)  │  │  │
│  │  │  - Pure Camera (No Mirror/Filter│      │  - Centralized Disk I/O           │  │  │
│  │  └─────────────────▲───────────────┘      └─────────────────┬─────────────────┘  │  │
│  └────────────────────┼────────────────────────────────────────┼────────────────────┘  │
│                       │                                        │                       │
│                       │ HTTP Liveview Stream                   │ HTTP /capture Request │
│                       │ (multipart/x-mixed-replace ~35 FPS)   │ (JSON Port 8899)      │
│                       │                                        ▼                       │
│                       │                      ┌──────────────────────────────────────┐  │
│                       └──────────────────────┤ FOTOLISM CANON PERSISTENT DAEMON     │  │
│                                              │ (fotolism_canon_daemon.exe - C# 64b) │  │
│                                              │                                      │  │
│                                              │ - Native EDSDK.dll 64-bit PTP Direct │  │
│                                              │ - Single-Threaded EVF Stream Engine  │  │
│                                              │ - ShutterButton_Completely_NonAF     │  │
│                                              │ - Anti-Sleep KeepAlive (15s Loop)    │  │
│                                              │ - Auto-Reconnect & 0x81 Busy Retry   │  │
│                                              └──────────────────┬───────────────────┘  │
│                                                                 │                      │
│                                                       USB 3.0   │ High-Speed PTP       │
│                                                                 ▼                      │
│                                              ┌──────────────────────────────────────┐  │
│                                              │ CANON EOS R100 / R50 / DSLR BODY     │  │
│                                              │ - Cảm biến 24MP Ultra HD Full EXIF   │  │
│                                              │ - Màn trập cơ học xả đúng 1 lần      │  │
│                                              │ - Ống kính khóa nét không đèn trợ nét│  │
│                                              └──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ 2. CƠ CHẾ ĐIỀU KHIỂN MÁY ẢNH & LUỒNG ẢNH TRỰC TIẾP (DIRECT EVF & SHUTTER)

### 2.1 Kiến trúc Canon EDSDK Persistent Daemon (`fotolism_canon_daemon.exe`)
Thay vì gọi các công cụ dòng lệnh (CLI) trung gian như `digiCamControl` hay sử dụng webcam ảo DirectShow (`EOS Webcam Utility`), hệ thống sử dụng một tiến trình daemon độc lập được viết bằng C# .NET 64-bit:
* **Giao thức:** Lắng nghe HTTP Server siêu nhẹ tại `http://127.0.0.1:8899/`.
* **Kéo frame EVF (Live View):** Gọi hàm `EdsDownloadEvfImage()` từ chip DIGIC của Canon, chuyển đổi luồng ảnh nén thành định dạng streaming `multipart/x-mixed-replace` gửi thẳng vào thẻ `<img src="http://127.0.0.1:8899/liveview">`. Tốc độ đạt **35 – 40 FPS** với độ trễ (latency) gần như bằng 0.
* **Chống ngủ (KeepAlive):** Định kỳ mỗi 15 giây gửi lệnh `kEdsCameraCommand_ExtendShutDownTimer` để máy ảnh không bao giờ tự tắt nguồn khi đang phục vụ khách.
* **Tự phục hồi kết nối:** Tự động lắng nghe sự kiện ngắt kết nối (`0x000000A2`, `0x00000080`), khởi tạo lại phiên làm việc ngay khi cáp USB được cắm lại hoặc công tắc máy ảnh bật sang `ON`.

### 2.2 Sơ đồ chụp ảnh tức thì & Ngăn chặn xả 2 lần màn trập

```
┌─────────────────────────────────┐
│       Người dùng nhấn chụp      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     Đếm ngược (3s, 5s, 10s)     │
│   Khóa nút bấm chụp (disabled)  │
└────────────────┬────────────────┘
                 │
                 ▼ (Tại đúng 0s)
┌─────────────────────────────────────────────────────────┐
│  1. Chớp Flash trắng toàn màn hình                      │
│  2. Chụp khung hình tạm từ Live View (< 0.1s) đưa vào ô │
│  3. Nếu KHÔNG có máy ảnh Canon: phát 1 tiếng TÁCH loa   │
│  4. Nếu CÓ máy ảnh Canon: NGẮT LOA, chỉ để cơ học kêu  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Gửi lệnh: GET /capture?savePath=...                    │
│  - EdsSendCommand(Completely_NonAF) (Zero AF Delay)     │
│  - Bỏ qua bước Halfway gây giật 2 nhịp                  │
│  - Xử lý mã bận 0x00000081 (nhả nút OFF & thử lại 60ms)│
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼ (Thời gian phơi sáng + truyền USB: ~1.1s - 1.3s)
┌─────────────────────────────────────────────────────────┐
│  Bắt sự kiện: kEdsObjectEvent_DirItemRequestTransfer    │
│  - FileStream ghi trực tiếp file ảnh 24MP ra đĩa        │
│  - Gửi lệnh ShutterButton_OFF giải phóng nút chụp      │
│  - Trả JSON kết quả về Electron Main Process            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Cập nhật ô Slot bằng ảnh 24MP gốc (Full Resolution)    │
│  Mở khóa nút bấm chụp (isCapturingShot = false)         │
│  Sẵn sàng đón lượt chụp tiếp theo                       │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Nguyên lý triệt tiêu tiếng "Tách 2 lần" (Double Shutter Actuation)
1. **Chỉ gửi lệnh `Completely_NonAF` đúng 1 lần:** Trước đây hệ thống gửi bước đệm `Halfway` (nửa nút) để lấy nét trước khi gửi `Completely`, làm rèm trập máy ảnh Mirrorless đóng mở 2 lần liên tiếp. Việc chuyển sang `Completely_NonAF` giúp máy ảnh xả màn trập **đúng 1 tiếng tách cơ học duy nhất**.
2. **Khóa chống bấm đè (`await api.camera.edsdkCapture`):** Giao diện Kiosk giữ cờ `isCapturingShot = true` trong suốt quá trình máy ảnh phơi sáng và truyền dữ liệu USB, ngăn khách hàng vô tình bấm liên tục tạo hàng đợi lệnh chụp trùng lặp.
3. **Phân tách âm thanh loa và cơ học:** Hàm `playCameraShutterSound()` được tinh chỉnh thành 1 tiếng click dứt khoát và tự động tắt khi có máy ảnh Canon thật, loại bỏ hoàn toàn hiện tượng âm thanh loa máy tính kêu đè lên âm thanh màn trập cơ học.

---

## 🎨 3. CHÍNH SÁCH ẢNH THUẦN KHIẾT & GƯƠNG LUÔN TẮT (PURE CAMERA & NO MIRROR)

Để chất lượng ảnh chụp Photobooth đạt chuẩn studio chuyên nghiệp và đồng nhất với cảm biến máy ảnh:
1. **Pure Camera Defaults (Zero Filter):**
   - Mặc định 0% tất cả các hiệu ứng can thiệp số: `slimFace: 0`, `skinSmoothing: 0`, `whiteningTone: 0`, `rosyTone: 0`, `glowClarity: 0`.
   - Chuỗi CSS filter áp dụng trên luồng hiển thị là `none`.
   - Giữ nguyên 100% màu sắc, nhiệt độ màu (White Balance) và độ tương phản quang học từ ống kính Canon.
   - Đèn trợ sáng viền (Ring Light) mặc định là tắt (`false`).
2. **Gương luôn luôn tắt (`mirrorCamera = false`):**
   - Giá trị khởi tạo mặc định trong Store là `false`.
   - Các hàm bắt đầu phiên (`startNewSession`), làm mới phiên (`clearSession`), hoặc hoàn tác cài đặt (`resetAdjustments`) đều cưỡng chế đặt lại `mirrorCamera: false`.
   - Đã gỡ bỏ nút bấm lật gương trên thanh công cụ Kiosk để khách hàng không thể vô tình bật lật ảnh.
   - Hình ảnh hiển thị trực tiếp (Live View) khớp 1:1 với ảnh chụp 24MP (chữ trên áo, biển hiệu và góc đứng không bị đảo ngược chiều trái/phải).

---

## 📁 4. CƠ CHẾ LƯU TRỮ TẬP TRUNG (`Fotolism_image`)

Toàn bộ hình ảnh, dải in và video hậu trường được quản lý tập trung theo quy chuẩn:

| Cấu hình | Giá trị mặc định | Mô tả |
|---|---|---|
| **Thư mục chính** | `F:\Fotolism_image` (hoặc `D:\Fotolism_image`) | Ổ cứng tốc độ cao lưu trữ ảnh gốc 24MP |
| **Tiền tố ảnh đơn** | `fotolism_shot_{index}_{timestamp}.jpg` | File ảnh chụp 24MP full EXIF (hoặc 1080p fallback) |
| **Tiền tố dải in** | `fotolism_strip_{layout}_{timestamp}.jpg` | Dải ảnh hoàn chỉnh đã ghép khung, theme & sticker |
| **Tiền tố video** | `fotolism_timelapse_{timestamp}.webm` | Video tua nhanh quá trình tạo dáng hậu trường |
| **Tiền tố phiên chụp**| `fotolism_session_{timestamp}` | Thư mục đóng gói toàn bộ media của một phiên |

---

## 🧪 5. HỆ THỐNG KIỂM THỬ TỰ ĐỘNG 3 TẦNG (AUTOMATED TEST SUITE)

Hệ thống được bảo vệ bởi bộ test tự động toàn diện chạy qua Vitest (`npm run test`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TỔNG HỢP KIỂM THỬ TỰ ĐỘNG                       │
├────────────────────────────────────────────────────────────────────────┤
│ Level 1: Unit Tests (Pricing, Store Invariants & Pure Defaults)        │
│   ✓ Tính chuẩn giá 2x6, 4x6, phụ phí bản in thêm & mã giảm giá Coupon │
│   ✓ Đảm bảo Default Beauty Config = 0% và CSS filter = 'none'         │
│   ✓ Xác minh mirrorCamera = false bất biến qua mọi vòng đời phiên      │
│   ✓ Kích thước bản vẽ 2x6 (600x1800) và 4x6 (1200x1800) chuẩn 300 DPI  │
├────────────────────────────────────────────────────────────────────────┤
│ Level 2: Integration Tests (Canon Native Daemon & IPC Bridge)          │
│   ✓ IT-01: Healthcheck cổng 8899 phản hồi trạng thái kết nối          │
│   ✓ IT-02: Endpoint /frame kéo frame JPEG tĩnh hợp lệ                  │
│   ✓ IT-03: Endpoint /liveview truyền luồng MJPEG liên tục 35 FPS       │
│   ✓ IT-04: Endpoint /capture xả màn trập không trễ, lưu 24MP < 2.0s    │
│   ✓ IT-05: Cấu trúc IPC Bridge an toàn qua Preload ContextIsolation   │
├────────────────────────────────────────────────────────────────────────┤
│ Level 3: System E2E User Stories (Kiosk Full Lifecycle)                │
│   ✓ US-01: Quy trình Photobooth 4 ô cổ điển kèm Retake ô hỏng          │
│   ✓ US-02: Quy trình Selfbooth tự do theo đồng hồ đếm lùi              │
│   ✓ US-03: Tích hợp thanh toán VietQR Napas 24/7                      │
│   ✓ US-04: Tự động ghi video Timelapse hậu trường tua nhanh            │
│   ✓ US-05: Đồng bộ Google Drive Webhook trong nền                      │
│   ✓ US-06: Bảng điều khiển quản trị Admin được khóa mã PIN             │
└────────────────────────────────────────────────────────────────────────┘
```
*Chạy toàn bộ 25 bài test tự động:*
```powershell
cd f:\JoyBooth\desktop
npm run test
```

---

## 🛠️ 6. HƯỚNG DẪN BIÊN DỊCH & VẬN HÀNH

### 6.1 Biên dịch Canon Native Daemon 64-bit
Khi có chỉnh sửa trong [desktop/native-daemon/CanonDaemon.cs](file:///f:/JoyBooth/desktop/native-daemon/CanonDaemon.cs):
```powershell
cd f:\JoyBooth\desktop\native-daemon
powershell.exe -ExecutionPolicy Bypass -File .\build.ps1
```
*File thực thi `fotolism_canon_daemon.exe` sẽ được xuất thẳng ra thư mục `desktop/electron/`.*

### 6.2 Khởi chạy môi trường phát triển (Development)
Tại thư mục gốc `f:\JoyBooth`:
```powershell
npm run dev
```

### 6.3 Kiểm tra kiểu dữ liệu & Đóng gói sản phẩm
```powershell
cd f:\JoyBooth\desktop
npm run build
```

---

## 📋 7. QUY TRÌNH VẬN HÀNH TẠI SỰ KIỆN (OPERATOR CHECKLIST)

1. **Kiểm tra đầu ca:**
   * Cắm cáp USB máy ảnh Canon EOS R100 vào cổng **USB 3.0** máy tính Kiosk.
   * Bật nguồn máy ảnh Canon, gạt cần sang chế độ chụp ảnh tĩnh (`M` hoặc `P`, khuyến nghị `1/125s, f/4.0, ISO 400 - 800`).
   * Cắm nguồn máy in ảnh nhiệt (DNP / HiTi), đảm bảo đủ giấy in và mực ribbon.
2. **Khởi động Fotolism:**
   * Mở ứng dụng Fotolism.
   * Chạm vào biểu tượng **⚙️ (Bánh răng)** tại màn hình chờ, nhập mã PIN quản trị viên (cấu hình động, mặc định xác thực an toàn).
   * Kiểm tra thông số sự kiện, kết nối camera (hiển thị *📸 Máy ảnh Canon EOS - EDSDK Trực Tiếp*).
   * Nhấn nút *"📸 Vào Chế Độ Chụp"* để sẵn sàng đón khách.
3. **Xử lý sự cố nhanh (Troubleshooting):**
   * *Máy ảnh không nhận lệnh chụp:* Đảm bảo không có ứng dụng Canon EOS Utility chính hãng chạy đè. Nếu máy vào chế độ ngủ (Sleep), chỉ cần bấm nhẹ nửa nút chụp vật lý trên máy ảnh hoặc gạt công tắc nguồn `OFF` $\rightarrow$ `ON` để daemon tự nhận lại phiên làm việc trong 2 giây.
   * *Hết giấy in:* Thay cuộn giấy mới, vào menu Admin bấm *"Kiểm tra máy in"* để in bản test.

---

## 🏛️ 8. PHÂN HỆ KIOSK LOCAL ADMIN (FOTOLISM 3.0)

### 8.1 Mục Tiêu & Nguyên Tắc Thiết Kế
Kiosk Local Admin phục vụ trực tiếp cho Kỹ thuật viên và Nhân viên vận hành tại chỗ tại từng trạm Kiosk.
- **Nguyên tắc phân định trách nhiệm:** Local Admin **chỉ quản lý vận hành phần cứng & xử lý sự cố tại máy trạm**. Toàn bộ cấu hình kinh doanh (giá, voucher, layout, khung hình, doanh thu chuỗi) do **Cloud CMS quản lý tập trung**, không xây dựng lại tại máy trạm để tránh phân mảnh dữ liệu.
- **Triết lý UI/UX:** Phong cách **Warm Minimalism × Modern Editorial × Soft Luxury** (Espresso Brown `#502A1D` + Warm Cream `#FAF6F1`), font chữ Plus Jakarta Sans và Lucide Icons. Tối ưu nút bấm to rõ cho màn hình cảm ứng Kiosk và remote bluetooth.

### 8.2 Cấu Trúc 4 Tab Quản Trị Chuẩn

```
┌────────────────────────────────────────────────────────────────────────┐
│               FOTOLISM 3.0 — KIOSK LOCAL ADMIN CONSOLE                 │
├──────────────┬──────────────┬──────────────┬───────────────────────────┤
│ 1. TỔNG QUAN │ 2. THIẾT BỊ  │ 3. PHIÊN CHỤP│ 4. HỆ THỐNG               │
└──────────────┴──────────────┴──────────────┴───────────────────────────┘
```

1. **Tab 1 — Tổng Quan (Overview):**
   - **Thẻ trạng thái tức thì:** Camera (DSLR / Canon EDSDK), Máy in nhiệt (DNP/HiTi), Kết nối Internet (Wi-Fi/LAN/4G), Đồng bộ CMS (Trạng thái Heartbeat & số bản ghi chờ sync), Dung lượng ổ đĩa lưu trữ ảnh.
   - **Trạng thái Kiosk:** `Sẵn sàng đón khách` | `Đang trong phiên chụp` | `Tạm ngưng bảo trì`.
   - **Bảng cảnh báo sự cố (Warning Center):** Tự động phát hiện và cảnh báo trực quan: mất cáp USB camera, hết giấy in, kẹt lệnh in Spooler, mất mạng Internet.

2. **Tab 2 — Thiết Bị (Hardware):**
   - **Camera:** Kết nối/ngắt kết nối, xem luồng Live View EVF thời gian thực, nút chụp thử (nảy màn trập Canon EDSDK 24MP và kiểm tra thời gian ghi nhận ảnh), cấu hình khẩu độ, tốc độ màn trập, ISO khi daemon hỗ trợ.
   - **Printer (Máy in):** Danh sách máy in khả dụng trong Windows, chọn khổ giấy mặc định (2x6 strip kép hoặc 4x6 đơn), nút in bản test chuẩn màu Fotolism 300 DPI, kiểm tra hàng đợi Windows Print Spooler và đếm định mức cuộn giấy.
   - **Display & Remote:** Cấu hình màn hình chính (Kiosk Touch) và màn hình phụ (Overhead Live View Display), kiểm tra tín hiệu remote bluetooth / bàn phím điều hướng.

3. **Tab 3 — Phiên Chụp (Sessions & Prints):**
   - Xem danh sách phiên chụp gần đây lưu trong SQLite cục bộ (`SessionDB`).
   - Xem chi tiết từng phiên: Ảnh gốc (RAW), ảnh hoàn thiện (Composited Strip), trạng thái thanh toán (VietQR/Tiền mặt), thời gian chụp và lịch sử in.
   - **In lại có kiểm soát:** Cho phép in lại dải ảnh khi xảy ra sự cố kẹt giấy/mất điện, bắt buộc chọn lý do và ghi nhận **Audit Log** để đối soát với Cloud CMS.
   - **Lọc phiên chưa đồng bộ:** Đánh dấu rõ các phiên đang nằm trong hàng đợi ngoại tuyến (`pending_sync`).

4. **Tab 4 — Hệ Thống (System):**
   - Cấu hình âm thanh: Âm thanh màn trập (Shutter sound), âm đếm ngược (Countdown beeps), âm thanh hoàn tất.
   - Thiết lập cục bộ: Chế độ toàn màn hình, độ sáng, khởi động cùng Windows.
   - **Phiên bản & Daemon:** Hiển thị phiên bản ứng dụng Kiosk Fotolism 3.0 và trạng thái tiến trình `fotolism_canon_daemon.exe` (Port 8899).
   - **Đồng bộ CMS:** Kiểm tra kết nối Cloud CMS (Ping / Heartbeat), nút *"Đồng bộ lại dữ liệu lỗi"* (Force Sync Outbox).
   - **Log & Chẩn đoán:** Bảng xem log sự cố cục bộ, chẩn đoán tự động một chạm và nút khởi động lại ứng dụng có xác nhận an toàn.

### 8.3 Cơ Chế Xác Thực & Phân Quyền Bảo Mật
- **Bảo mật PIN động:** Truy cập Local Admin yêu cầu mã **PIN 6 số** nhập qua bàn phím số Numpad cảm ứng to rõ.
- **Không hardcode PIN:** Mã PIN được quản lý tập trung từ Cloud CMS, truyền xuống Kiosk và mã hóa hash an toàn trong SQLite cục bộ. Khi mất mạng Internet, Kiosk vẫn xác thực mã PIN đã lưu trong cache.
- **Audit Logging:** Mọi hành vi nhạy cảm (in lại ảnh, hủy phiên, chuyển chế độ bảo trì, thay đổi cấu hình phần cứng, khởi động lại app) đều được ghi nhật ký bất biến với thời gian, mã định danh Kiosk và đẩy lên Cloud CMS.

