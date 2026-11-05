---
name: qr-delivery
description: Hướng dẫn tạo mã QR tức thì cho khách quét tải ảnh và video timelapse về điện thoại (hỗ trợ cả Online Google Drive/CDN và Offline LAN Hotspot) cho Fotolism 3.0.
---

# 📱 QR Delivery Skill — Fotolism 3.0

Hướng dẫn chuẩn hóa quy trình phân phối ảnh chụp và video hậu trường (Timelapse) tức thì đến điện thoại khách hàng thông qua mã QR trên màn hình [ReviewScreen](file:///f:/Fotolism/desktop/src/screens/ReviewScreen.tsx).

---

## 1. Hai Chế Độ Phân Phối Ảnh Độc Lập

```
                                 ┌─────────────────────────┐
                                 │ Khách hàng quét mã QR   │
                                 │ trên màn hình Kiosk     │
                                 └────────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         [ CHẾ ĐỘ 1: ONLINE CLOUD ]                      [ CHẾ ĐỘ 2: OFFLINE HOTSPOT ]
        (Có kết nối mạng Internet)                       (Không có kết nối Internet)
                      │                                               │
                      ▼                                               ▼
     ┌─────────────────────────────────┐             ┌─────────────────────────────────┐
     │ Upload lên Google Drive / CDN   │             │ Máy Kiosk phát WiFi Hotspot     │
     │ - Link thư mục Drive phiên chụp │             │ - Link tải trực tiếp qua LAN    │
     │ - Khách tải qua mạng 4G/5G      │             │ - Khách tải qua WiFi nội bộ     │
     │ - Xem được cả ảnh gốc & timelapse│            │ - Tốc độ cực nhanh không tốn 4G │
     └─────────────────────────────────┘             └─────────────────────────────────┘
```

---

## 2. Chi Tiết Thực Thi Kỹ Thuật

### Chế độ 1: Online Google Drive / Cloud CDN
1. **Quy trình hoạt động**:
   - Khi hoàn thành phiên chụp, Electron Main Process gọi API Google Drive (`api.storage.uploadDriveSession`):
     - Tạo thư mục riêng theo mã phiên: `Fotolism_<sessionId>`.
     - Tải lên: File ảnh in hoàn chỉnh (`composite_print.jpg`), các ảnh đơn 24MP, và video hậu trường (`timelapse.webm`).
     - Bật quyền truy cập công khai cho người có link (`reader` permission).
2. **Tạo mã QR tức thì**:
   - Sử dụng thư viện `qrcode` tạo Data URL mã QR SVG/PNG:
     ```typescript
     import QRCode from 'qrcode'
     const qrDataUrl = await QRCode.toDataURL(driveFolderUrl, {
       width: 320,
       margin: 2,
       color: { dark: '#2d2426', light: '#ffffff' }
     })
     ```

### Chế độ 2: Offline LAN Hotspot (Tuyệt đối không cần Internet)
1. **Thiết lập Kiosk phát WiFi Hotspot**:
   - Máy tính Windows phát WiFi Hotspot: SSID `Fotolism_Booth_Free`, không mật khẩu hoặc mật khẩu đơn giản `88888888`.
2. **Máy chủ phân phối nội bộ (Local Static Server)**:
   - Electron Main Process kích hoạt 1 HTTP server nhẹ trên cổng nội bộ:
     `http://192.168.137.1:5173/download/<sessionId>`
   - Khi khách kết nối vào WiFi của gian booth và quét mã QR: Trình duyệt Safari/Chrome trên điện thoại mở ngay trang web nội bộ hiển thị đầy đủ các ảnh và nút **"Tải về điện thoại"**.
   - Thời gian tải ảnh 6MB qua sóng WiFi nội bộ chỉ mất **dưới 1 giây**.

---

## 3. Quy Chuẩn Đóng Gói File Phiên Chụp

Mỗi thư mục phiên tải về của khách hàng phải chứa đầy đủ:
- `01_in_anh_ky_niem.jpg`: Bức ảnh ghép khung hoàn chỉnh đã gửi tới máy in.
- `02_anh_goc_24mp_shot_*.jpg`: Các bức ảnh đơn gốc từ cảm biến Canon EOS R100 để khách tự do đăng mạng xã hội.
- `03_video_hau_truong.mp4` / `.webm`: Video timelapse ngắn ghi lại biểu cảm vui vẻ của nhóm bạn trong lúc tạo dáng.
