---
name: ui-ux-design
description: Hướng dẫn quy chuẩn thiết kế giao diện UI/UX Fotolism 3.0 theo triết lý Warm Minimalist Luxury, 3 tông màu chủ đạo, Touch-First Kiosk, tỉ lệ 16:9, typography và Call-To-Action (CTA).
---

# 🎨 UI/UX Design System Skill — Fotolism 3.0

Cẩm nang quy chuẩn thiết kế giao diện Kiosk Photobooth và Cloud CMS của hệ thống **fotolism 3.0**. Áp dụng triệt để ngôn ngữ thiết kế **Warm Minimalist Luxury** (Tối giản ấm áp sang trọng phong cách Hàn Quốc/Nhật Bản).

---

## 1. Triết Lý Thiết Kế Cốt Lõi (Core Philosophy)

1. **Warm Minimalist Luxury**:
   - Tối giản nhưng không lạnh lẽo: Tạo cảm giác cao cấp, ấm cúng và gần gũi.
   - Loại bỏ mọi chi tiết đồ họa thừa thãi, viền trang trí lòe loẹt hoặc văn bản mô tả dài dòng làm loãng thị giác khách hàng.
2. **Strict 3-Color Palette (Quy chuẩn 3 tông màu)**:
   - **Màu chủ đạo (Primary Brand)**: Nâu cà phê đậm espresso (`#502A1D`, Hover: `#633726`, Active: `#3D2017`).
   - **Màu nền & Bề mặt ấm (Warm Neutrals)**: Kem ngọc trai (`#FAF6F1`), Trắng sữa bề mặt thẻ (`#FFFFFF`), Nền nổi bật (`#FFF9F4`), Viền cấu trúc (`#E6D9CF`).
   - **Màu chữ & Nhấn phụ (Text & Accents)**: Nâu sẫm tiêu đề (`#2A1810`), Nâu trầm phụ đề (`#70594F`), Muted (`#8C756B`).
3. **fotolism Lowercase Branding (Viết thường toàn bộ)**:
   - Tên thương hiệu luôn viết thường: `fotolism` (không bao giờ viết `FOTOLISM` hoặc `Fotolism`).
4. **Action-Driven Call-To-Action (CTA)**:
   - Nút hành động chính phải to, rõ ràng, đặt ở vị trí thuận tay nhất.
   - Luôn đính kèm thông số cụ thể trực tiếp trên nút CTA (ví dụ: `Chuyển Khoản Ngay (50.000 đ) ➔`, `Bắt Đầu Chụp Ngay (5 Phút) ➔`).

---

## 2. Quy Chuẩn Kiosk Touch-First (Kiosk Standards)

- **Kích thước vùng chạm (Touch Target)**:
  - Nút bấm, stepper, icon-back: Tối thiểu $48 \times 48\text{px}$ (khuyến nghị $50\text{px}$ đến $56\text{px}$).
- **Bán kính bo góc (Border Radius)**:
  - Thẻ bao ngoài (Cards): `24px`.
  - Khung xem trước, khối nhập liệu bên trong: `14px` đến `16px`.
  - Nút bấm chính (CTA), Stepper buttons, Tags, Badges: `9999px` (Full-rounded pill).
- **Phản hồi xúc giác thị giác (Haptic Visual Feedback)**:
  - Transition mượt mà: `0.15s` đến `0.2s` `cubic-bezier(0.16, 1, 0.3, 1)`.
  - Hover: phóng to nhẹ `scale(1.02 - 1.05)` hoặc đổ bóng sâu hơn.
  - Active / Press: co nhẹ `scale(0.97 - 0.98)`.

---

## 3. Quy Chuẩn Tỉ Lệ & Bố Cục Không Gian (Proportions & Layout)

1. **Khóa Tỉ Lệ Camera Live View 16:9**:
   - Bắt buộc dùng `aspect-ratio: 16 / 9; object-fit: cover;` để hình ảnh không bị méo, bẹt hoặc kéo giãn.
2. **Mockup Dải Kép Chân Thực (Dual-Strip 2x6)**:
   - Tuyệt đối không để 1 dải strip mỏng lọt thỏm giữa một khung rộng tạo ra khoảng trống trắng mênh mông ở 2 bên.
   - Luôn hiển thị dải kép (2 dải 2x6 in song song có đường rãnh cắt giữa) mô phỏng chính xác bản in đôi máy in nhiệt DNP RX1HS.
3. **Cân Bằng Chiều Cao & Canh Giữa Thẻ (Zero Awkward Whitespace)**:
   - Các thẻ nội dung đối xứng (ví dụ thẻ Bố cục và thẻ Thanh toán) phải có chiều cao đồng đều (~`410px - 430px`).
   - Căn giữa màn hình theo cả phương ngang và dọc (`display: flex; align-items: center; justify-content: center;`).
   - Không kéo dãn `height: 100%` hoặc `100vh` một cách tùy tiện gây hở khoảng trống lớn vô nghĩa.

---

## 4. Tinh Gọn Văn Bản & Trải Nghiệm Người Dùng (Microcopy)

- **Thời gian**: Chỉ ghi số phút (ví dụ: `5 Phút`, `7 Phút`, `10 Phút`), không kèm câu phụ rườm rà.
- **Tông màu ảnh**: Tối đa 3 tông chuẩn (Tự nhiên, Trắng Đen, Tone Ấm).
- **Nút In ảnh**: Ghi đơn giản `In ảnh`, disable ngay sau khi nhấn 1 lần để chống in đè/trùng lệnh.
- **Nút Kết thúc**: Ở màn hình QR giao ảnh, nút quay về trang chủ đổi thành `Kết Thúc` và chỉ xuất hiện khi mã QR đã sẵn sàng.

---

## 5. Bảng Mã Màu Tokens Chuẩn

| Token CSS / Hex | Tên Thẩm Mỹ | Mục Đích Sử Dụng |
| :--- | :--- | :--- |
| `#502A1D` | **Espresso Dark** | Nút bấm chính CTA, Tiêu đề lớn, Trạng thái đang chọn |
| `#633726` | **Espresso Hover** | Hiệu ứng rê chuột / chạm nhẹ vào nút |
| `#3D2017` | **Espresso Pressed**| Phản hồi khi nút đang được ấn xuống |
| `#FAF6F1` | **Warm Cream** | Nền chính của toàn bộ ứng dụng |
| `#FFFFFF` | **Pearl White** | Bề mặt các thẻ card, pop-up, modal |
| `#FFF9F4` | **Warm Ivory** | Khối nền phụ trợ (stepper, discount box) |
| `#E6D9CF` | **Hairline Sand** | Đường viền mảnh phân tách, border thẻ |
| `#2A1810` | **Deep Cocoa** | Chữ nội dung chính, giá tiền nổi bật |
| `#70594F` | **Muted Walnut** | Nhãn phụ, phụ đề, hướng dẫn |

