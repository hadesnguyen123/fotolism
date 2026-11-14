---
name: frame-compositor
description: Hướng dẫn xử lý bố cục khung ảnh, ghép ảnh đa ô (Strip 2x6 kép, Khổ đơn 4x6 300 DPI), cắt crop căn chỉnh khuôn mặt thông minh và xuất file in Fotolism 3.0.
---

# Frame Compositor Skill — Fotolism 3.0

Tuân thủ `AGENTS.md`; mọi thao tác ghép khung phải bảo toàn ảnh gốc, không kéo méo tỷ lệ (no stretching) và đồng bộ WYSIWYG giữa `InteractiveStripPreview.tsx` với `canvasCompositor.ts`.

## 1. Quy cách khổ in (300 DPI / 600 DPI)

| Khổ bố cục | 300 DPI | 600 DPI | Quy cách ghép | Máy in mục tiêu |
| :--- | :--- | :--- | :--- | :--- |
| **Dual Strip `2x6`** | `1200 x 1800 px` | `2400 x 3600 px` | 2 dải song song (`600x1800` / `1200x3600 px`), 3 hoặc 4 ô giống nhau | DNP DS-RX1HS (2-inch cut) |
| **Portrait `4x6`** | `1200 x 1800 px` | `2400 x 3600 px` | 1 ô lớn hoặc lưới 2, 4 (`2x2`), 6, 9 ô | DNP RX1HS, HiTi P525L, Canon Selphy |
| **Landscape `4x6`** | `1800 x 1200 px` | `3600 x 2400 px` | 1 ô đại diện hoặc 4 ô xếp hàng ngang | Tiệc cưới, sự kiện |
| **Vuông `5x5`** | `1500 x 1500 px` | `3000 x 3000 px` | 1 ô vuông hoặc 4 ô cân xứng | Chia sẻ mạng xã hội |

## 2. Thứ tự lớp ghép & Căn crop

- **Thứ tự 4 lớp (dưới → trên)**: `1. Phông nền (Base)` → `2. Ảnh chụp đã crop + slotOffsets ({ x, y, scale })` → `3. Text / Sticker` → `4. PNG Overlay khung sự kiện`.
- **Face-Aware Center Crop**: Giữ nguyên Aspect Ratio ảnh gốc 3:2 (`6000x4000`). Dùng bounding box MediaPipe để neo đỉnh đầu (Top Anchor) nếu mặt lệch trên, hoặc tính trọng tâm trung bình khi chụp nhóm.

## 3. Quy chuẩn xuất file

- **Định dạng**: Hệ màu `sRGB`, chuẩn `300 DPI` (hoặc `600 DPI` chế độ nét cao trên DNP RX1HS / DS620A), JPEG Quality `98%`.
- **Lưu trữ song song**:
  - Bản in: `F:\Fotolism_image\sessions\<sessionId>\composite_print.jpg`
  - Bản web/QR: `F:\Fotolism_image\sessions\<sessionId>\composite_web.jpg`
