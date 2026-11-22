# Fotolism 3.0 — Hướng dẫn Setup & Triển khai Kiosk (Windows All-in-One)

Từ bản **`v0.1.1`** trở đi, Fotolism Desktop được đóng gói dạng **All-in-One** (`fotolism-Setup-x.y.z.exe`), tích hợp sẵn:
- Giao diện Kiosk (Electron + React, hỗ trợ cả **Photobooth 16:9** và **Selfbooth 9:16**).
- **Canon EDSDK Daemon** (`fotolism_canon_daemon.exe`, `EDSDK.dll`, `EdsImage.dll`).
- **AI Service tự chứa** (`fotolism_ai_service.exe` — đã nhúng sẵn Python runtime, OpenCV, MediaPipe, FastAPI, Pillow, pywin32 và các model/preset).
- **Auto-Update qua GitHub Releases** (`hadesnguyen123/fotolism-releases`).

👉 **Trên máy Kiosk mới KHÔNG cần cài Python, KHÔNG cần chạy `pip install`, KHÔNG cần tạo file `.env`.**

---

## 1. Yêu cầu phần cứng Kiosk

Pipeline AI Enhance chạy **100% trên CPU** (YuNet ONNX + MediaPipe FaceLandmarker + OpenCV/NumPy); GPU chỉ phục vụ hiển thị Electron & WebGL Live View (30 FPS).

| Linh kiện | Mức tối thiểu | Mức khuyến nghị (chạy 12–16h/ngày) |
| :--- | :--- | :--- |
| **Hệ điều hành** | Windows 10 / 11 (64-bit) | Windows 10 / 11 Pro (64-bit) |
| **CPU** | Intel Core i5 đời 9+ (6 nhân) | Intel Core i3-12100 / i5-12400 trở lên |
| **RAM** | 16 GB DDR4 (8GB x2) | 16 GB DDR4/DDR5 |
| **GPU** | iGPU đời 12+ hoặc VGA 2GB VRAM (GT 1030+) | iGPU (CPU pipeline) hoặc RTX 3050/3060 (nếu mở rộng AI GPU) |
| **Ổ cứng** | SSD 256 GB | **SSD NVMe 512 GB – 1 TB** (lưu ảnh gốc 24MP + timelapse) |
| **Nguồn (PSU)** | 450W công suất thực | **500W – 550W 80 Plus** chính hãng |
| **Màn hình** | Cảm ứng (hoặc màn IPS + khung touch) | IPS 60Hz màu chuẩn, cảm ứng (16:9 Photobooth / 9:16 Selfbooth) |

---

## 2. Cài đặt trên máy Kiosk mới (chỉ làm 1 lần duy nhất)

### Bước 1: Cài phần mềm Fotolism (1 file duy nhất)
1. Mở trình duyệt trên máy Kiosk, vào:
   https://github.com/hadesnguyen123/fotolism-releases/releases
2. Tải file **`fotolism-Setup-x.y.z.exe`** mới nhất và nhấn đúp để cài đặt.
3. Nếu Windows chưa có sẵn thư viện C++, cài thêm **Microsoft Visual C++ Redistributable 2015–2022 (x64)**.

### Bước 2: Cài phần cứng & Driver
- **Máy in nhiệt (DNP RX1HS, HiTi P525L, Canon Selphy...):**
  - Cài driver chính hãng và chọn khổ giấy mặc định (`4x6` hoặc `2x6` cut) trong *Windows Printers & Scanners*.
- **Máy ảnh Canon (EOS R100 / dòng hỗ trợ EDSDK):**
  - Cắm trực tiếp vào cổng USB 3.0 trên mainboard.
  - **KHÔNG cài (hoặc gỡ/tắt hoàn toàn) Canon EOS Utility và EOS Webcam Utility** vì sẽ chiếm cổng USB làm Canon Daemon lỗi kết nối.
- **Màn hình cảm ứng:**
  - Cài driver touch (nếu dùng khung rời) và chọn đúng hướng hiển thị Windows: **Landscape (16:9)** cho Photobooth hoặc **Portrait (9:16)** cho Selfbooth.

### Bước 3: Chọn chế độ Photobooth / Selfbooth
- Mở app Fotolism → bấm **nút bánh răng cưa nhỏ ở góc trên bên phải** màn hình chờ để vào **Admin → Overview** → chọn **Photobooth** hoặc **Selfbooth** (chế độ sẽ tự lưu lại qua các lần cập nhật sau).

### Bước 4: Tối ưu Windows chạy 24/7
- **Power & Sleep:** đặt *Turn off screen* = `Never`, *Sleep* = `Never`.
- **Windows Update:** tắt tự khởi động lại trong giờ hoạt động.
- **Thông báo:** bật *Do Not Disturb / Focus Assist*.
- **Ghi đè cấu hình (tùy chọn):** chỉ khi cần đổi URL CMS hoặc tắt auto-update (`DISABLE_AUTO_UPDATE=true`), tạo file `%APPDATA%\fotolism\.env`.

---

## 3. Tự động cập nhật phiên bản mới (Auto-Update)

### Cách hoạt động trên máy Kiosk
- Mỗi lần mở app (trước khi vào màn hình Kiosk), app tự kiểm tra GitHub Releases trong tối đa **6 giây**:
  - Nếu **mất mạng / không có bản mới**: tự bỏ qua và vào Kiosk offline bình thường.
  - Nếu **có bản mới**: hiện thanh tiến trình `%` → tự tải phần thay đổi → tự dừng Canon Daemon & AI Service → cài đè âm thầm → tự mở lại phiên bản mới.
- Toàn bộ ảnh chụp, SQLite DB và cấu hình máy trong `%APPDATA%\fotolism\` luôn được giữ nguyên.

### Cách phát hành bản mới trên máy Dev
1. Tăng `version` trong `desktop/package.json` (ví dụ `0.1.1` → `0.1.2`).
2. Đảm bảo đã lưu `GH_TOKEN` (Fine-grained token có quyền `Contents: Read and write` cho repo `hadesnguyen123/fotolism-releases`) trên máy Dev.
3. Chạy lệnh:
   ```powershell
   cd desktop
   npm run release:win
   ```
   *(Lệnh tự động đóng gói `fotolism_ai_service.exe` bằng PyInstaller, build Electron và upload lên GitHub Releases).*
4. Vào https://github.com/hadesnguyen123/fotolism-releases/releases bấm **Publish release** (nếu đang ở trạng thái Draft).

---

## 4. Checklist kiểm tra nhanh trước khi bàn giao Kiosk

- [ ] Mở app Fotolism: hiển thị đúng tỉ lệ (Photobooth `16:9` / Selfbooth `9:16`), cảm ứng nhạy.
- [ ] `http://127.0.0.1:8899/status` phản hồi OK, Live View mượt và **bật gương (Mirror)** khớp từ Live View → ảnh chụp → xem lại → ảnh in.
- [ ] `http://127.0.0.1:8000/health` phản hồi `{"status": "ok"}`, chụp thử 1 phiên và chạy AI Enhance thành công.
- [ ] In thử 1 tấm kiểm tra đúng khổ giấy, không lệch lề, không kẹt hàng đợi Windows Print Spooler.
- [ ] Quét thử mã QR tải ảnh (Online R2 hoặc Offline LAN).
- [ ] Kiểm tra đồng bộ lên Cloud CMS và test rút mạng để xác nhận chế độ offline-first vẫn chụp/in bình thường.
