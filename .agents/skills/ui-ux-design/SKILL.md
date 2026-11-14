---
name: ui-ux-design
description: Hướng dẫn quy chuẩn thiết kế giao diện UI/UX Fotolism 3.0 theo triết lý Warm Minimalist Luxury, 3 tông màu chủ đạo, Touch-First Kiosk, tỉ lệ 16:9, typography và Call-To-Action (CTA).
---

# UI/UX Design System Skill — Fotolism 3.0

Tuân thủ `AGENTS.md` và `.agents/rules/ui-design.md` (Warm Minimalist Luxury, thương hiệu viết thường `fotolism`, dùng Lucide Icons, nút điều hướng đáy cách lề tối thiểu `100px` chỉ gồm chữ).

## 1. Quy chuẩn Kiosk Touch-First

- **Touch Target**: Nút bấm, stepper, icon-back tối thiểu `48 x 48px` (khuyến nghị `50–56px`).
- **Border Radius**: Card ngoài `24px`; khung preview / input `14–16px`; CTA, stepper, tag/badge `9999px`.
- **Feedback**: Transition `0.15–0.2s cubic-bezier(0.16, 1, 0.3, 1)`; hover `scale(1.02–1.05)`; active `scale(0.97–0.98)`.

## 2. Tỉ lệ & Bố cục không gian

- **Camera Live View `3:2` (Photobooth)**: Bắt buộc `aspect-ratio: 3:2 ; object-fit: cover;` để không kéo méo hình.
- **Mockup Dual-Strip `2x6`**: Hiển thị 2 dải `2x6` song song có rãnh cắt giữa mô phỏng bản in đôi DNP RX1HS; không để 1 dải đơn lọt thỏm giữa khung rộng.
- **Cân bằng thẻ**: Các thẻ đối xứng giữ chiều cao đồng đều (`410–430px`), căn giữa theo 2 trục; không kéo dãn `height: 100%` / `100vh` gây khoảng trống thừa.

## 3. Microcopy

- **Thời gian**: Chỉ ghi số phút (`5 Phút`, `7 Phút`, `10 Phút`).
- **Tông màu ảnh**: Tối đa 3 tông chuẩn (Tự nhiên, Trắng Đen, Tone Ấm).
- **Nút `In ảnh`**: Disable ngay sau lần nhấn đầu để chống in trùng.
- **Nút `Kết Thúc`**: Ở màn QR giao ảnh, chỉ hiện khi mã QR đã sẵn sàng.

## 4. Bảng mã màu Tokens

| Hex | Tên Token | Mục đích |
| :--- | :--- | :--- |
| `#502A1D` | **Espresso Dark** | CTA chính, tiêu đề lớn, trạng thái chọn |
| `#633726` | **Espresso Hover** | Hover CTA |
| `#3D2017` | **Espresso Pressed** | Active / nhấn giữ |
| `#FAF6F1` | **Warm Cream** | Nền chính toàn app |
| `#FFFFFF` | **Pearl White** | Bề mặt card, modal |
| `#FFF9F4` | **Warm Ivory** | Khối phụ (stepper, discount box) |
| `#E6D9CF` | **Hairline Sand** | Viền mảnh, border card |
| `#2A1810` | **Deep Cocoa** | Chữ chính, giá tiền |
| `#70594F` | **Muted Walnut** | Nhãn phụ, hướng dẫn |
