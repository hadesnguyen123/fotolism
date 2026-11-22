# Fotolism 3.0 — Hướng dẫn Setup & Triển khai Kiosk (Windows)

Tài liệu tổng hợp cấu hình phần cứng, môi trường cần cài đặt trên máy Kiosk mới, cấu hình đóng gói `.exe` và quy trình cập nhật phiên bản cho **Fotolism 3.0 Desktop Kiosk**.

---

## 1. Yêu cầu phần cứng Kiosk

Pipeline AI Enhance hiện tại (`desktop/ai-service/`) chạy **100% trên CPU** (YuNet ONNX + MediaPipe FaceLandmarker + OpenCV/NumPy), **không dùng PyTorch/CUDA/GFPGAN**. GPU chỉ phục vụ hiển thị Electron và WebGL MediaPipe Live View (30 FPS).

| Linh kiện | Mức tối thiểu (chạy ổn pipeline hiện tại) | Mức khuyến nghị (ổn định lâu dài / 12–16h/ngày) |
| :--- | :--- | :--- |
| **Hệ điều hành** | Windows 10 / 11 (64-bit) | Windows 10 / 11 Pro (64-bit) |
| **CPU** | Intel Core i5 đời 9+ (6 nhân) | Intel Core i3-12100 / i5-12400 trở lên |
| **RAM** | 16 GB DDR4 (8GB x2) | 16 GB DDR4/DDR5 |
| **GPU** | iGPU đời 12+ hoặc VGA rời 2GB VRAM (GT 1030+) | iGPU (nếu giữ CPU pipeline) hoặc **RTX 3050 / 3060** (nếu sau này bật AI GPU) |
| **Ổ cứng** | SSD 256 GB | **SSD NVMe 512 GB – 1 TB** (lưu ảnh gốc 24MP + timelapse offline) |
| **Nguồn (PSU)** | 450W công suất thực | **500W – 550W chuẩn 80 Plus** (chính hãng, tránh sụt áp USB) |
| **Màn hình** | Cảm ứng (hoặc màn IPS 60Hz + khung touch rời) | IPS màu chuẩn sRGB, hỗ trợ cảm ứng (ngang `16:9` cho Photobooth, dọc `9:16` cho Selfbooth) |

---

## 2. Cài đặt trên máy Kiosk mới

### 2.1. Runtime & Môi trường cho `ai-service`
1. Cài **Microsoft Visual C++ Redistributable 2015–2022 (x64)** (bắt buộc cho OpenCV, MediaPipe và Canon EDSDK).
2. Cài **Python 3.10 hoặc 3.11 (64-bit)** — nhớ tích chọn **Add Python to PATH**.
3. Copy thư mục `desktop/ai-service/` (và đảm bảo có model `public/mediapipe/models/face_landmarker.task`) vào máy, sau đó cài thư viện:
   ```powershell
   cd desktop\ai-service
   pip install -r requirements.txt
   ```
   *(Danh sách hiện tại chỉ gồm các gói thực sự sử dụng: `fastapi`, `uvicorn[standard]`, `pillow`, `opencv-python`, `mediapipe`, `qrcode[pil]`, `pydantic`, `pywin32` trên Windows).*

> **Lưu ý:** `.NET Framework 4.x` (cho `fotolism_canon_daemon.exe`) và Chromium (bên trong Electron) đã có sẵn, không cần cài Node.js hay Chrome trên máy Kiosk.

### 2.2. Phần cứng & Driver
- **Máy in nhiệt (DNP RX1HS, HiTi P525L, Canon Selphy...):**
  - Cài driver chính hãng từ nhà sản xuất.
  - Cấu hình sẵn khổ giấy mặc định (`4x6` hoặc `2x6` cut) trong *Windows Printers & Scanners* và đặt làm máy in mặc định nếu cần.
- **Máy ảnh Canon (EOS R100 / dòng hỗ trợ EDSDK):**
  - Cắm trực tiếp vào cổng USB 3.0 ổn định trên mainboard (hạn chế qua hub USB rẻ tiền).
  - **BẮT BUỘC không cài (hoặc gỡ/tắt hoàn toàn) Canon EOS Utility và EOS Webcam Utility** — các phần mềm này sẽ chiếm quyền USB khiến `fotolism_canon_daemon.exe` không kết nối được máy ảnh.
- **Màn hình cảm ứng:**
  - Cài driver touch (nếu dùng khung cảm ứng rời) và hiệu chuẩn cảm ứng (*Tablet PC Settings*).
  - Đặt đúng hướng hiển thị Windows: **Landscape (16:9)** cho Photobooth hoặc **Portrait (9:16)** cho Selfbooth.

### 2.3. Cấu hình biến môi trường (`.env`)
Sao chép `desktop/.env.example` thành `.env` và điền thông số triển khai thực tế:

```env
# Frontend (Vite)
VITE_CMS_STAGING_URL=https://fotolism-cms.vercel.app
VITE_CMS_URL=https://fotolism-cms.vercel.app
VITE_CANON_DAEMON_URL=http://127.0.0.1:8899

# Electron Main Process & Background Workers
CMS_STAGING_URL=https://fotolism-cms.vercel.app
CMS_URL=https://fotolism-cms.vercel.app
CANON_DAEMON_URL=http://127.0.0.1:8899
AI_SERVICE_URL=http://127.0.0.1:8000
```

### 2.4. Tối ưu Windows để chạy Kiosk 24/7
- **Power & Sleep:** Đặt *Turn off screen* = `Never`, *Sleep* = `Never`.
- **Windows Update:** Tắt tự động khởi động lại trong giờ hoạt động (*Active Hours* hoặc Group Policy).
- **Thông báo:** Bật *Do Not Disturb / Focus Assist* để tránh popup hệ thống đè lên màn hình Kiosk.
- **Cổng nội bộ:** Đảm bảo không có ứng dụng khác chiếm cổng `8000` (AI Service) và `8899` (Canon EDSDK Daemon).

---

## 3. Cấu hình đóng gói `.exe` (`desktop/package.json`) — Đã hoàn thiện

Cấu hình `electron-builder` trong `desktop/package.json` và tầng Electron/Python đã được thiết lập sẵn:

1. **Canon EDSDK Daemon + DLL nằm ngoài `app.asar`:**
   - `fotolism_canon_daemon.exe`, `fotolism_canon_capture.exe`, `canon_edsdk_capture.ps1`, `EDSDK.dll`, `EdsImage.dll` được xuất vào `resources/canon-daemon/` và `cameraIpc.cts` tự nhận ưu tiên từ `process.resourcesPath` với `cwd` trỏ đúng thư mục DLL.
2. **Đóng gói kèm mã nguồn `ai-service` và model MediaPipe:**
   - Toàn bộ mã nguồn `ai-service/` (bỏ `__pycache__`) được xuất vào `resources/ai-service/` và `face_landmarker.task` xuất vào `resources/mediapipe/models/face_landmarker.task`.
   - `windowIpc.cts` tự tìm `main.py` tại `process.resourcesPath` và ưu tiên gọi Python từ `FOTOLISM_PYTHON_PATH` → `C:\Fotolism\ai-env\Scripts\python.exe` → `python` (PATH).
   - `korean_beauty_engine.py` tự nhận `face_landmarker.task` ở cả đường dẫn bản đóng gói lẫn đường dẫn dev.
3. **Bộ cài NSIS & Nạp `.env` ngoài `app.asar`:**
   - `win.target` đã chuyển sang `["nsis"]` (tạo `desktop/release/fotolism Setup x.y.z.exe`).
   - `common.cts` tự nạp `.env` từ `%APPDATA%\fotolism\.env` (ưu tiên cao nhất để không bị mất khi cài đè), thư mục chứa `.exe` hoặc `resources/.env`.

**Lệnh build bộ cài Windows:**
```powershell
cd desktop
npm run build:win
```
File cài đặt sẽ nằm tại `desktop/release/fotolism Setup <version>.exe`.

---

## 4. Setup để cập nhật thường xuyên khi hệ thống có thay đổi

Nguyên tắc tách **Lớp nền cố định (setup 1 lần)** và **Lớp ứng dụng (cập nhật thường xuyên)**:

### Bước 1: Setup lớp nền cố định trên máy Kiosk (chỉ làm 1 lần duy nhất)
1. **Tạo môi trường Python cố định tại `C:\Fotolism\ai-env`:**
   ```powershell
   python -m venv C:\Fotolism\ai-env
   C:\Fotolism\ai-env\Scripts\pip install --upgrade pip
   C:\Fotolism\ai-env\Scripts\pip install -r "C:\Program Files\fotolism\resources\ai-service\requirements.txt"
   ```
   *(Electron sẽ tự động phát hiện và dùng `C:\Fotolism\ai-env\Scripts\python.exe` ở mọi lần khởi chạy).*
2. **Đặt file `.env` cố định tại `%APPDATA%\fotolism\.env`:**
   - Khi cài đè bản `.exe` mới, thư mục `%APPDATA%\fotolism\` (gồm `.env`, SQLite DB, cấu hình cục bộ) **luôn được giữ nguyên**, không cần cấu hình lại từng máy.

### Bước 2: Quy trình phát hành & cập nhật mỗi khi có bản mới (thêm/sửa/xóa tính năng)

#### Phương án A: Cập nhật nhanh bằng NSIS Setup `.exe` (phù hợp 1–5 máy)
1. Trên máy dev: tăng `version` trong `desktop/package.json` (ví dụ `0.1.0` → `0.1.1`) và chạy `npm run build:win`.
2. Trên máy Kiosk:
   - Đóng app Fotolism (nếu cần, tắt nốt `fotolism_canon_daemon.exe` và `python.exe` trong Task Manager để không bị khóa file).
   - Chạy file `fotolism Setup 0.1.1.exe` để cài đè — toàn bộ giao diện Electron, Canon Daemon và mã nguồn `ai-service/*.py` sẽ tự động thay bằng bản mới (tính năng đã xóa sẽ biến mất hoàn toàn).
   - **Chỉ khi `requirements.txt` có thêm thư viện mới**, chạy thêm 1 lệnh:
     ```powershell
     C:\Fotolism\ai-env\Scripts\pip install -r "C:\Program Files\fotolism\resources\ai-service\requirements.txt"
     ```

#### Phương án B: Tự động cập nhật qua GitHub Releases (Đã tích hợp sẵn)
Hệ thống đã tích hợp `electron-updater` trong `desktop/electron/autoUpdater.cts` và cấu hình `build.publish` trỏ tới GitHub Releases:

1. **Cách hoạt động trên máy Kiosk:**
   - Ngay khi vừa mở app (trước khi vào màn hình Kiosk), app tự kiểm tra GitHub Releases (tối đa 6 giây — nếu mất mạng sẽ tự bỏ qua và vào Kiosk offline bình thường).
   - Nếu có bản mới: hiện thanh tiến trình tải → tự tắt `fotolism_canon_daemon.exe` & `ai-service` → cài đè âm thầm → tự mở lại phiên bản mới.
   - Muốn tạm tắt auto-update trên 1 máy nào đó, thêm `DISABLE_AUTO_UPDATE=true` vào `%APPDATA%\fotolism\.env`.

2. **Cách phát hành bản mới trên máy Dev:**
   - Tạo Personal Access Token trên GitHub có quyền `repo` (hoặc `public_repo` nếu dùng repo release public) và gán biến môi trường `GH_TOKEN`:
     ```powershell
     $env:GH_TOKEN="ghp_xxxxxxxxxxxx"
     ```
   - Tăng `version` trong `desktop/package.json` (ví dụ `0.1.0` → `0.1.1`) rồi chạy:
     ```powershell
     cd desktop
     npm run release:win
     ```
   - Lệnh này sẽ tự build và đẩy `fotolism Setup x.y.z.exe`, `*.blockmap`, `latest.yml` lên GitHub Releases. Vào trang Releases trên GitHub bấm **Publish release** (nếu đang ở trạng thái Draft).

3. **Repo Release Public:**
   - Hiện `desktop/package.json` đã trỏ sẵn tới repo Public `hadesnguyen123/fotolism-releases` (chỉ chứa file bản build, tách biệt hoàn toàn với source code Private).
   - Máy Kiosk **không cần đặt `GH_TOKEN`** trong `.env`; chỉ máy Dev cần `GH_TOKEN` (quyền `public_repo`) khi chạy `npm run release:win`.

### 3 lưu ý bắt buộc khi xóa tính năng cũ
1. **Tắt sạch tiến trình con trước khi cài đè:** Tránh lỗi Windows khóa file `fotolism_canon_daemon.exe` hoặc `ai-service`.
2. **Fallback cấu hình/DB cũ:** Nếu xóa preset, filter hoặc chế độ cũ, bản mới phải fallback về mặc định khi đọc dữ liệu cũ còn trong `%APPDATA%\fotolism\` hoặc từ Cloud CMS.
3. **Không xóa ảnh & dữ liệu phiên:** Ảnh chụp và SQLite DB luôn lưu ngoài thư mục cài đặt (`D:\Fotolism_image` / `%APPDATA%\fotolism\`), đảm bảo an toàn tuyệt đối qua mọi đợt nâng cấp.

---

## 5. Checklist kiểm tra nhanh trước khi bàn giao Kiosk

- [ ] Mở app Fotolism: màn hình hiển thị đúng tỉ lệ (Photobooth `16:9` / Selfbooth `9:16`), cảm ứng nhạy.
- [ ] `http://127.0.0.1:8899/status` phản hồi OK, Live View mượt và **bật gương (Mirror)** khớp từ Live View → ảnh chụp → ảnh xem lại → ảnh in.
- [ ] `http://127.0.0.1:8000/health` phản hồi `{"status": "ok"}`, chụp thử 1 phiên và chạy AI Enhance thành công.
- [ ] In thử 1 tấm kiểm tra đúng khổ giấy, không lệch lề, không kẹt hàng đợi Windows Print Spooler.
- [ ] Quét thử mã QR tải ảnh (Online R2 hoặc Offline LAN).
- [ ] Kiểm tra đồng bộ phiên chụp lên Cloud CMS (và test rút mạng để xác nhận chế độ offline-first vẫn chụp/in bình thường).
