---
name: camera-integration
description: Hướng dẫn tích hợp, điều khiển máy ảnh Canon EOS R100 qua Canon EDSDK C# Persistent Daemon, Live View thời gian thực và quản lý phần cứng camera cho Fotolism 3.0.
---

# 📸 Camera Integration Skill — Fotolism 3.0

Hướng dẫn chuẩn hóa quy trình kết nối, điều khiển và giám sát máy ảnh Canon EOS DSLR/Mirrorless (trọng tâm Canon EOS R100) thông qua **C#/.NET 64-bit Persistent Daemon** trên nền tảng Fotolism Photobooth.

---

## 1. Kiến Trúc Luồng Camera (Fotolism 3.0)

```
┌────────────────────────────────────────────────────────┐
│               Canon EOS R100 (Mirrorless)              │
│       Cắm 1 dây USB Type-C duy nhất vào Laptop        │
└───────────────────────────┬────────────────────────────┘
                            │ (USB 2.0 PTP Protocol)
                            ▼
┌────────────────────────────────────────────────────────┐
│     Fotolism Canon Daemon (C# x64, Port 8899)          │
│  - EDSDK Session duy nhất, không tạo tiến trình mới    │
│  - STA Command Queue + Idempotency Map chống 2 nháy    │
│  - Latest-Frame Buffer EVF (~25-33 FPS, 960x640)       │
└─────────────┬────────────────────────────┬─────────────┘
              │ (HTTP MJPEG Stream)        │ (REST API & IPC)
              ▼                            ▼
┌────────────────────────────┐  ┌────────────────────────┐
│  Live View Preview (MJPEG) │  │  Electron Main Process │
│  - Kiosk Main Screen       │  │  - Supervisor Daemon   │
│  - Overhead HDMI Display   │  │  - SQLite SessionDB    │
│  - WebGL Contrast Optimize │  │  - Atomic File Move    │
└────────────────────────────┘  └────────────────────────┘
```

---

## 2. Các Endpoints Điều Khiển (Daemon 127.0.0.1:8899)

| Endpoint | Method | Chức năng | Định dạng dữ liệu |
| :--- | :--- | :--- | :--- |
| `http://127.0.0.1:8899/status` | `GET` | Kiểm tra trạng thái máy ảnh, EVF, pin, FPS, độ trễ | `{"connected":bool, "evfReady":bool, "cameraState":"LIVEVIEW", "fps":float, "latencyMs":int}` |
| `http://127.0.0.1:8899/frame` | `GET` | Lấy 1 khung hình JPEG mới nhất từ bộ đệm EVF | `image/jpeg` binary |
| `http://127.0.0.1:8899/liveview` | `GET` | Luồng xem trước video liên tục thời gian thực | `multipart/x-mixed-replace; boundary=--myboundary` |
| `http://127.0.0.1:8899/api/captures` | `POST` | Kích hoạt chụp ảnh không trễ có Idempotency | **Body**: `{"captureId":string, "sessionId":string, "slotIndex":int}`<br>**Res**: `{"success":bool, "savedPath":string, "sizeBytes":int, "latencyMs":int, "idempotent":bool}` |
| `http://127.0.0.1:8899/api/diagnostics` | `GET` | Telemetry giám sát & lịch sử 60 log gần nhất | `{"cameraState":string, "evfFps":float, "totalCaptures":int, "failedCaptures":int, "recentLogs":[...]}` |
| `http://127.0.0.1:8899/quit` | `GET` | Tắt daemon sạch và giải phóng EDSDK | `{"ok":true}` |

---

## 3. Quy Tắc Lập Trình & Vận Hành Bắt Buộc

1. **Tuyệt đối không đóng session trong khối `finally`**:
   - `EdsOpenSession()` được duy trì xuyên suốt thời gian Kiosk hoạt động.
   - Chỉ đóng session khi ứng dụng shutdown (`app.on('will-quit')`), camera bị rút cáp vật lý hoặc khi cần phục hồi lỗi nghiêm trọng.
2. **Loại bỏ hoàn toàn lệnh shutter trùng**:
   - Mỗi lệnh chụp từ client gửi xuống phải có `captureId`, `sessionId`, `slotIndex`.
   - Nếu client gửi lại cùng `captureId`, daemon trả về ngay ảnh đã lưu hoặc chờ job đang chụp, **không gửi thêm lệnh shutter cơ học lần thứ hai**.
3. **Lệnh chụp Zero-Lag**:
   - Sử dụng `kEdsCameraCommand_ShutterButton_Completely_NonAF` (0x00010003) để chụp tức thì không trễ đèn trợ nét.
   - Luôn nhả nút chụp về `kEdsCameraCommand_ShutterButton_OFF` (0x00000000) ngay khi phơi sáng xong.
4. **Latest-Frame Buffer**:
   - Bộ đệm EVF chỉ giữ 1 frame mới nhất (`LatestEvfFrame`). Bỏ qua frame cũ khi client đọc chậm, đảm bảo độ trễ xem trước luôn < 100ms.
5. **Khử mờ & Tối ưu cạnh sắc (Frontend)**:
   - Áp dụng `image-rendering: -webkit-optimize-contrast` trên thẻ `<img>` và `<canvas>` để chống mờ nội suy khi kéo giãn 960x640 lên màn hình cảm ứng 1080p.
   - Không áp dụng CSS `blur(...)` toàn khung hình trên luồng Live View.
6. **Webcam Fallback An Toàn**:
   - Chỉ chuyển sang webcam khi Canon mất kết nối và phải thông báo rõ trên giao diện. Không âm thầm thay thế ảnh chụp máy ảnh cơ bằng ảnh webcam.

---

## 4. Xử Lý Sự Cố Phần Cứng (Troubleshooting)

- **Lỗi `0x00000081` (DeviceBusy)**:
  - Máy ảnh vừa kéo frame EVF nên cổng PTP đang bận. Daemon tạm dừng 60ms, gửi lệnh nhả shutter OFF, sau đó chỉ thử lại 1 lần duy nhất.
- **Rút cáp USB hoặc tắt nguồn camera**:
  - Daemon chuyển sang trạng thái `DISCONNECTED`. Bộ thăm dò tự động (Auto-Recovery) trong Electron và React polling mỗi 2 giây sẽ tự động kích hoạt kết nối lại ngay khi cắm lại cáp mà không cần khởi động lại phần mềm.
- **Xung đột ứng dụng & Thư viện DLL**:
  - `EDSDK.dll` và `EdsImage.dll` (64-bit) đã được nhúng sẵn cùng file thực thi `fotolism_canon_daemon.exe`. Không cần cài đặt hay bật phần mềm *EOS Webcam Utility Pro* hoặc *digiCamControl*.
  - Đảm bảo đã tắt/gỡ bỏ hoàn toàn ứng dụng *Canon EOS Utility*, *EOS Webcam Utility*, *Lightroom*, *OBS* hoặc *digiCamControl* để không tranh chấp cổng USB PTP với `fotolism_canon_daemon.exe`.
