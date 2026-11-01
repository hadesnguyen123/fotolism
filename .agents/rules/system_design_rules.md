# FOTOLISM 3.0 — HỆ QUY TẮC THIẾT KẾ BẤT BIẾN (IMMUTABLE DESIGN RULES)
> Tham chiếu file gốc: `F:\JoyBooth\FOTOLISM_DESIGN_GUIDELINES.md`
> TUYỆT ĐỐI KHÔNG TỰ Ý THAY ĐỔI CÁC ĐIỀU KHOẢN SAU ĐÂY:

1. **Bottom Navigation & Seamless Canvas**:
   - Nút `Quay lại` ở góc dưới bên trái, nút `Tiếp tục` (hoặc `Bắt đầu`) ở góc dưới bên phải.
   - Cách lề chuẩn 100px.
   - Chỉ hiển thị đúng 2 chữ: "Quay lại" và "Tiếp tục" / "Bắt đầu", không thêm bớt bất kỳ icon hay giá tiền nào.
   - Không đặt nút back ở header trên cùng.
   - Tuyệt đối không dùng đường kẻ cắt ngang trên (border-bottom header) và dưới (border-top footer). Nền màn hình phải liền mạch (seamless canvas).

2. **Idle / Home Screen**:
   - 2 thẻ PHOTOBOOTH và SELFBOOTH không chứa nút bấm CTA và không chứa caption mô tả phụ. Dưới logo thương hiệu không để phụ đề.
   - Chỉ có duy nhất 1 nút `Bắt đầu` ở góc dưới bên phải cách lề 100px.

3. **Zero Descriptive Text & Simplified Layout**:
   - Tuyệt đối không thêm bất kỳ mô tả hay câu văn hướng dẫn nào dưới title hoặc trên các panel.
   - Màn Chọn Layout: Tiêu đề "Chọn Layout", không phụ đề, không gạch chân. Bố cục đang chọn hiển thị rõ nét 100%, tất cả các layout không được chọn bắt buộc làm mờ đi (`opacity: 0.38 - 0.42`) để người dùng tập trung thị giác vào lựa chọn chính.
   - Màn Xác nhận đơn hàng (bước 1): Tiêu đề "Xác nhận đơn hàng" to 2.2rem. Bỏ các tag nhãn thừa và viền nét đứt.
   - Màn Thanh toán QR (bước 2): Tiêu đề "Thanh Toán". Bỏ mô tả "Quét mã VietQR...", bỏ tag "MÃ QR", bỏ "MBBANK 24/7", bỏ câu "Đang tự động kiểm tra...".
   - Màn Chọn Frame: Tiêu đề "Chọn Frame", bỏ phụ đề "Mẫu Khung".
   - Màn Bộ Lọc Màu: Tiêu đề "Bộ Lọc Màu", bỏ phụ đề "Tông Màu Yêu Thích", chỉ đúng 3 bộ lọc.
   - Màn Ảnh Hoàn Thiện: Tiêu đề "Ảnh Hoàn Thiện", canvas liền mạch không đường cắt ngang trên/dưới.

4. **Pricing, Printing & Footer Banner**:
   - Khổ 2x6: Gói cơ bản 70k gồm 2 dải in; in thêm mỗi lần +2 dải (+30k/lượt). Bước nhảy stepper: 2, 4, 6, 8, 10, 12 dải.
   - Khổ 4x6: Gói cơ bản 90k gồm 1 tấm in; in thêm mỗi lần +1 tấm (+30k/lượt). Bước nhảy stepper: 1, 2, 3, 4, 5, 6 tấm.
   - Banner GIÁ IN THÊM ở màn Bảng Giá: CSS Grid 3 cột (Quay lại bên trái, Banner chính giữa, Tiếp tục bên phải), cao 52px đồng bộ, bo góc 9999px, chữ nằm gọn trọn vẹn 100% trong nền hồng, không tràn mép.

5. **Color Filters**:
   - Chỉ duy nhất đúng 3 bộ lọc màu: Tự nhiên (`normal`), Cổ điển B&W (`vintage_noir`), Retro 90s (`retro_90s`).
   - Không tự ý thêm bộ lọc khác.

6. **Branding & Iconography**:
   - Thương hiệu `fotolism` luôn viết thường toàn bộ.
   - 3 màu: `#351A10`, `#FAF7F2`, `#F2D8D0`.
   - 100% sử dụng icon vector Lucide React (`lucide-react`). Tuyệt đối cấm dùng emoji hệ điều hành (🖼️, 🎬, 🖨️, 📸,...) trên giao diện.

