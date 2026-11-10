---
trigger: glob
globs: "{desktop/src/**,design-system/**,cms/src/**}"
description: Quy chuẩn thiết kế giao diện UI/UX Kiosk Photobooth Warm Minimalist Luxury (màu sắc, nút bấm, padding 100px, canvas liền mạch).
---

# FOTOLISM 3.0 — HỆ QUY TẮC THIẾT KẾ BẤT BIẾN (IMMUTABLE UI/UX RULES)

> **Tham chiếu chuẩn**: Toàn bộ giao diện Touch-First của Kiosk tuân thủ triết lý **Warm Minimalist Luxury**.

---

## 1. Điều Hướng Đáy (Bottom Navigation) & Canvas Liền Mạch

* **Vị trí nút chuẩn**: Nút `Quay lại` ở góc dưới bên trái, nút `Tiếp tục` (hoặc `Bắt đầu`) ở góc dưới bên phải.
* **Cách lề chuẩn 100px**: Luôn áp dụng khoảng cách đáy và hai bên tối thiểu 100px để người dùng chạm ngón tay tự nhiên mà không bị che khuất.
* **Microcopy tối giản**: Nút điều hướng chỉ hiển thị đúng 2 chữ: `"Quay lại"` và `"Tiếp tục"` / `"Bắt đầu"`. Tuyệt đối không thêm icon mũi tên, ký hiệu hay giá tiền vào trong lòng nút.
* **Nền liền mạch (Seamless Canvas)**: Tuyệt đối không dùng đường kẻ cắt ngang trên (`border-bottom` header) và dưới (`border-top` footer). Toàn bộ màn hình tạo thành một canvas đồng nhất.

---

## 2. Nhận Diện Thương Hiệu & Bảng Màu Cốt Lõi

* **Thương hiệu**: Tên thương hiệu luôn viết thường toàn bộ: **`fotolism`** (không viết hoa chữ cái đầu hoặc toàn bộ).
* **Bảng màu 3 tông cốt lõi**:
  * **Nâu cà phê đậm espresso**: `#502A1D` (hoặc `#351A10` viền chọn) — màu chữ chính, khung viền active và nút CTA.
  * **Nền kem ngọc trai & trung tính ấm**: `#FAF6F1` / `#FAF7F2` / `#E6D9CF` — màu nền trang, thẻ và container.
  * **Trắng sữa bề mặt thẻ**: `#FFFFFF` — bề mặt hiển thị nội dung nổi bật.
  * **Hồng nhấn phụ banner**: `#F2D8D0` — dải băng highlight giá hoặc badge phụ.
* **Biểu tượng (Iconography)**: 100% sử dụng icon vector Lucide React (`lucide-react`). Tuyệt đối cấm dùng emoji hệ điều hành trên giao diện.

---

## 3. Triệt Tiêu Chữ Mô Tả Rườm Rà (Zero Descriptive Text)

* Không để câu văn giải thích, mô tả hoặc phụ đề dưới các tiêu đề chính. Khách hàng tự hiểu thao tác chạm Touch-First trực quan.
* Màn Chọn Layout: Tiêu đề `"Chọn Layout"`, không phụ đề. Layout đang chọn hiển thị rõ 100%, các layout khác làm mờ (`opacity: 0.38 - 0.42`).
* Màn Xác nhận đơn hàng: Tiêu đề `"Xác nhận đơn hàng"`. Loại bỏ các tag nhãn thừa và viền nét đứt.
* Màn Thanh toán: Tiêu đề `"Thanh Toán"`. Loại bỏ các câu hướng dẫn thừa.
* Màn Chọn Frame: Tiêu đề `"Chọn Frame"`, không thêm phụ đề.
* Màn Bộ Lọc Màu: Tiêu đề `"Bộ Lọc Màu"`. Đúng 3 bộ lọc: Tự nhiên (`normal`), Cổ điển B&W (`vintage_noir`), Retro 90s (`retro_90s`).

---

## 4. Tỉ Lệ Live View & Quy Chuẩn In Ấn

* **Khóa tỷ lệ Live View 16:9**: Luôn áp dụng `aspect-ratio: 16 / 9; object-fit: cover;` để hình ảnh máy ảnh không bị méo lệch trên màn hình Kiosk.
* **Quy chuẩn bước nhảy bản in**: Đọc từ cấu hình nghiệp vụ hoặc `constants.ts`:
  * Khổ 2x6 dải strip: Bước nhảy số lượng là **+2 dải** (do dao cắt đôi 2-inch của máy in DNP RX1HS).
  * Khổ 4x6 đơn postcard: Bước nhảy số lượng là **+1 tấm**.
  * Bảng giá và đơn giá được nạp từ cấu hình hệ thống, không hardcode giá trị cố định vào component giao diện.

