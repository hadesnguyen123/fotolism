# 🖼️ Hướng Dẫn Cài Đặt & Thiết Kế Khung Ảnh Mẫu (Frame Templates) — Fotolism 3.0

Thư mục này chứa các file khung viền ảnh mẫu (Frame Overlays) cho hệ thống Fotolism Photobooth & Selfbooth.

---

## 1. Quy Chuẩn Kích Thước File Khung (Chuẩn In Nhiệt 300 DPI)

| Khổ Ảnh In | Kích Thước Pixel | Tỷ Lệ | Định Dạng File | Ứng Dụng |
| :--- | :--- | :--- | :--- | :--- |
| **Dải Đơn 2x6 Strip** | `600 x 1800 px` | 1:3 | PNG-24 (Alpha trong suốt) | Photobooth 3 ô / 4 ô kinh điển |
| **Dải Kép 2x6 Strip (Dual)** | `1200 x 1800 px` | 2:3 | PNG-24 (Alpha trong suốt) | Dải đôi cắt 2-inch cut trên DNP DS-RX1 |
| **Khổ 4x6 Dọc (Postcard)** | `1200 x 1800 px` | 2:3 | PNG-24 (Alpha trong suốt) | Lưới 4 ô (2x2), 6 ô (2x3), 1 ô lớn |
| **Khổ 4x6 Tràn Viền DNP (Full Bleed)** | `1240 x 1844 px` | ~2:3 | PNG-24 (Alpha trong suốt) | Khổ in tràn viền chuẩn máy in nhiệt DNP DS-RX1 / DS620 |
| **Khổ 4x6 Ngang (Landscape)** | `1800 x 1200 px` | 3:2 | PNG-24 (Alpha trong suốt) | Tiệc cưới, sự kiện công ty |

> [!IMPORTANT]
> **Quy tắc thiết kế quan trọng:**
> - **Các ô chứa ảnh khách PHẢI LÀ VÙNG TRONG SUỐT (Transparent / Alpha = 0)** để ảnh chụp của khách hiển thị xuyên qua bên dưới lớp khung.
> - **Hệ màu chuẩn**: `sRGB` (tránh dùng CMYK vì trình duyệt & máy in nhiệt sẽ bị lệch màu).
> - **Độ phân giải**: `300 DPI` (đảm bảo in ra sắc nét, không bị nhòe vỡ).

---

## 2. Tọa Độ Các Ô Ảnh (Slot Positions) Trên Khổ 2x6 (600 x 1800 px)

Khi dùng layout 4 ảnh dải dọc kinh điển (`4_strip_classic`):
- **Chiều rộng mỗi ô ảnh**: `528 px`
- **Chiều cao mỗi ô ảnh**: `388 px`
- **Tọa độ vị trí (X, Y)**:
  - **Ô 1**: `X = 36`, `Y = 40`
  - **Ô 2**: `X = 36`, `Y = 448`
  - **Ô 3**: `X = 36`, `Y = 855`
  - **Ô 4**: `X = 36`, `Y = 1263`
- **Khu vực chân trang (Footer Branding)**:
  - Vùng từ `Y = 1650` đến `Y = 1800` (chiều cao 150 px): Dành riêng cho logo thương hiệu, tên cô dâu chú rể, slogan sự kiện hoặc ngày kỷ niệm.

---

## 3. Cách Thêm Khung Mẫu Vào Hệ Thống Kiosk

### Bước 1: Lưu file thiết kế
Xuất file từ Photoshop, Canva hoặc Figma dạng `.png` (có nền trong suốt ở các ô) và chép vào thư mục:
```
desktop/public/frames/ten_khung_cua_ban.png
```

### Bước 2: Khai báo vào danh sách Theme
Mở file `desktop/src/store/appStore.ts`, tìm đến mảng `THEME_OPTIONS` và thêm mẫu khung của bạn:

```typescript
{
  id: 'theme_su_kien_xmas',
  name: 'Giáng Sinh Ấm Áp',
  category: 'Ngày lễ',
  bgColor: '#FFFFFF',
  bgGradient: '#FFFFFF',
  textColor: '#C41E3A',
  borderColor: '#C41E3A',
  overlayUrl: '/frames/ten_khung_cua_ban.png',
  hideFooter: true, // Đặt là true nếu trên file PNG của bạn đã tự vẽ sẵn chữ/logo kỷ niệm
}
```

### Bước 3: Xem ngay trên màn hình Kiosk
Sau khi lưu file:
- Mở màn hình Kiosk hoặc chế độ chọn Frame (`ThemeSelectScreen`), mẫu khung mới sẽ tự động hiển thị trong danh sách chọn.
- Khách hàng chọn khung sẽ thấy ảnh của họ được lồng chuẩn xác vào các ô trong suốt và khi in ra máy in DNP DS-RX1 sẽ xuất đúng khung viền sự kiện!

