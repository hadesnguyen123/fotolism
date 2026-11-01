# FOTOLISM 3.0 — QUY CHUẨN THIẾT KẾ BẤT BIẾN (DESIGN GUIDELINES REFERENCE)
> **Tài liệu tham chiếu chính thức:** Không tự động thay đổi sau này nếu không có chỉ định trực tiếp trong các yêu cầu thay đổi tiếp theo của dự án  
> **Cập nhật lần cuối:** 01/11/2026  
> **Áp dụng cho:** Kiosk Desktop (React 19 / Electron), Mobile Web, Cloud CMS.

---

## 🏛️ ĐIỀU 1: QUY CHUẨN ĐIỀU HƯỚNG CHÂN TRANG (BOTTOM NAVIGATION)
1. **Vị trí cố định tuyệt đối:**
   - Nút **`Quay lại`**: Luôn nằm ở **góc dưới bên tay trái**.
   - Nút **`Tiếp tục`** (hoặc **`Bắt đầu`** ở màn hình chính): Luôn nằm ở **góc dưới bên tay phải**.
   - Khoảng cách lề: **Cách lề mặc định đúng 100px** (`padding: 0 100px 24px;` hoặc `margin: 0 100px;`).
2. **Nội dung văn bản trên nút:**
   - **CHỈ HIỂN THỊ ĐÚNG 2 CHỮ**: `"Quay lại"` và `"Tiếp tục"` (hoặc `"Bắt đầu"`).
   - **TUYỆT ĐỐI KHÔNG THÊM BỚT**: Không kèm icon mũi tên, không kèm giá tiền, không kèm biểu tượng trang trí.
   - Text luôn nằm trên 1 dòng đơn (`white-space: nowrap; flex-shrink: 0;`), không xuống dòng.
3. **Cấm nút Back ở Header:**
   - Không đặt nút quay lại (Back arrow/button) ở thanh header trên cùng để tránh gây rối mắt và làm vỡ bố cục tối giản.
4. **Cấm đường cắt ngang trên và dưới (Seamless Canvas Rule):**
   - **Tuyệt đối không sử dụng đường kẻ ngang (border-bottom ở header, border-top ở footer)** hoặc các dải nền trắng tạo thành thanh chia cắt trên và dưới màn hình.
   - Toàn bộ giao diện phải là một canvas liền mạch (seamless), nền chuyển màu đồng nhất và khoáng đạt.

---

## 🎯 ĐIỀU 2: QUY CHUẨN MÀN HÌNH CHÍNH (IDLE / HOME SCREEN)
1. **Bố cục 2 trải nghiệm:** Gồm 2 thẻ card: `PHOTOBOOTH` và `SELFBOOTH`.
2. **Không để nút bấm & mô tả phụ bên trong thẻ:**
   - Xóa bỏ toàn bộ các nút bấm (`"BẮT ĐẦU ->"`) và caption mô tả phụ (*"Khung Strip & In Lấy Ngay"*, *"Tự Do Chụp Với Remote"*). Thẻ chỉ hiển thị icon minh họa và tên chế độ to rõ ràng.
   - Dưới logo thương hiệu `fotolism`: Không để phụ đề mô tả.
   - 2 thẻ đóng vai trò là thẻ lựa chọn: thẻ được chọn có viền màu nâu đậm `#351A10` (dày 3px) và huy hiệu checkmark tròn ở góc trên bên phải.
3. **Chỉ duy nhất 1 nút Bắt đầu ở góc phải:**
   - Ở góc dưới bên tay phải (cách lề 100px) có **DUY NHẤT 1 NÚT**: **`Bắt đầu`**.
   - Khi bấm `Bắt đầu`, hệ thống chuyển tiếp vào quy trình tương ứng của chế độ đang được chọn.

---

## 🚫 ĐIỀU 3: NGUYÊN TẮC ZERO DESCRIPTIVE TEXT (KHÔNG MÔ TẢ/HƯỚNG DẪN THỪA)
1. **Nguyên tắc cốt lõi:**
   - **Không thêm bất kỳ mô tả hay câu văn hướng dẫn nào lên màn hình khi tiến hành thiết kế.**
   - Người dùng tự hiểu thao tác qua giao diện trực quan Touch-First, không cần giải thích bằng lời.
2. **Áp dụng cụ thể:**
   - **Màn hình Chọn bố cục (`SelectLayoutScreen`):**
     - Tiêu đề trung tâm chỉ để: **`Chọn Layout`** (chuẩn Title Case, không dùng *BẢNG GIÁ*, không kèm phụ đề).
   - **Màn hình Xác nhận đơn hàng & Thanh toán (`PaymentScreen`):**
     - Bước 1 (Xác nhận): Tiêu đề trung tâm chỉ để: **`Xác nhận đơn hàng`**, kích thước font **`2.2rem`** (to bằng đúng tiêu đề *Chọn Layout* ở trang trước).
     - Bước 2 (Quét QR): Tiêu đề trung tâm chỉ để: **`Thanh Toán`**.
     - Bố cục thẻ đơn giản, tinh gọn: Bỏ các tag nhãn thừa (*BỐ CỤC*, *THANH TOÁN*), bỏ viền nét đứt ở mockup.
     - CẤM các phụ đề/hướng dẫn như: *"Quét mã VietQR bằng ứng dụng ngân hàng bất kỳ để chụp ảnh"*, *"Kiểm tra bố cục, số bản in..."*, *"Mở app Ngân hàng hoặc Ví điện tử để quét mã"*.
   - **Màn hình Chọn Frame (`ThemeSelectScreen`):**
     - Tiêu đề chỉ để: **`Chọn Frame`**.
     - Bỏ phụ đề *"Mẫu Khung"* ở cột bên phải.
   - **Màn hình Bộ lọc màu (`FilterScreen`):**
     - Tiêu đề chỉ để: **`Bộ Lọc Màu`**.
     - CẤM phụ đề như: *"Tông Màu Yêu Thích"*, *"Chọn tông màu bạn thích nhất trước khi quét mã..."*.
   - **Màn hình Thiết lập Selfbooth (`SelfboothSetupScreen`):**
     - Tiêu đề chỉ để: **`Thiết Lập Chụp`**.
     - CẤM subtitle: *"Chọn tông màu ảnh và thời gian chụp trước khi bắt đầu"*.
     - Nhãn lựa chọn chỉ ghi: `Tông màu`, `Thời gian`.
   - **Màn hình Review (`ReviewScreen`):**
     - Tiêu đề chỉ để: **`Ảnh Hoàn Thiện`**.
     - CẤM câu văn mô tả: *"Quét mã để tải ảnh và video về điện thoại"*.

---

## 🖨️ ĐIỀU 4: BẢNG GIÁ, KHỔ IN & SỐ LƯỢNG IN (PRICING & COPIES SPECIFICATION)
1. **Khổ nhỏ 2×6 inch (Dải Strip 4 ảnh dọc, 3 ảnh dọc):**
   - **Mặc định gói:** **2 dải in** với giá **70.000 đ** (tương đương 1 lượt in 4×6 xén đôi).
   - **In thêm:** Bước nhảy **+2 dải** (các nấc: 2 ➔ 4 ➔ 6 ➔ 8 ➔ 10 ➔ 12 dải) với giá **+30.000 đ / mỗi 2 dải in thêm**.
   - **Tuyệt đối không có bước nhảy lẻ 1 dải** (vì dao cắt máy in nhiệt DNP DS-RX1HS xén đôi 2-inch cut luôn ra 2 dải cùng lúc).
   - Đơn vị hiển thị: **`dải in`** (hoặc **`dải`**).
2. **Khổ lớn 4×6 inch (Postcard 6 ảnh, 4 ảnh vuông, 9 ảnh lưới):**
   - **Mặc định gói:** **1 tấm in** với giá **90.000 đ** (in nguyên tờ 4×6 không xén).
   - **In thêm:** Bước nhảy **+1 tấm** (các nấc: 1 ➔ 2 ➔ 3 ➔ 4 ➔ 5 ➔ 6 tấm) với giá **+30.000 đ / mỗi 1 tấm in thêm**.
   - Đơn vị hiển thị: **`tấm in`** (hoặc **`tấm`**).
3. **Banner phụ chân trang Bảng Giá (`SelectLayoutScreen`):**
   - **Bố cục chân trang:** Sử dụng **CSS Grid 3 cột** (`grid-template-columns: 1fr auto 1fr; align-items: center; padding: 8px 100px 24px;`):
     - Cột 1 (trái): Nút **`Quay lại`** (`justify-self: start;`)
     - Cột 2 (chính giữa màn hình): Banner **`GIÁ IN THÊM`** (`justify-self: center;`)
     - Cột 3 (phải): Nút **`Tiếp tục`** (`justify-self: end;`)
   - **Quy cách Banner:**
     - Chiều cao: **52px** (đồng bộ chiều cao 1:1 với 2 nút điều hướng 2 bên).
     - Bo góc: Bo tròn viên thuốc hoàn hảo (`border-radius: 9999px;`).
     - Lề trong: `padding: 0 36px;`.
     - Nền & bóng: Nền hồng ấm `#F2D8D0`, viền nhẹ `rgba(53, 26, 16, 0.12)`, bóng đổ nhẹ `0 4px 16px rgba(53, 26, 16, 0.08)`.
     - Tràn viền: `width: fit-content; max-width: none; white-space: nowrap;` — Toàn bộ text bắt buộc nằm trọn vẹn 100% bên trong nền hồng, tuyệt đối không tràn chữ ra ngoài.
     - Nội dung: `GIÁ IN THÊM: | Khổ 2×6: +30K / 2 dải • Khổ 4×6: +30K / 1 tấm` (có vạch ngăn dọc `|` màu `#351A10` độ mờ 35% và chấm tròn ngăn cách `•`).
4. **Quy chuẩn độ mờ layout không được chọn (Selection Focus Hierarchy):**
   - **Bố cục đang được chọn (`.poster-layout-item.selected`):** Hiển thị sắc nét 100% (`opacity: 1`), scale nhẹ nổi bật, viền nâu đậm chuẩn Studio `#A66A43` / `#1A0B06` và huy hiệu checkmark ở góc trên bên phải.
   - **Các bố cục KHÔNG được chọn (`.poster-layout-item:not(.selected)`):** Bắt buộc **làm mờ đi** (`opacity: 0.38`, kèm `filter: grayscale(10%)` nhẹ) để tạo sự phân cấp thị giác rõ rệt, thu hút toàn bộ sự chú ý của khách hàng vào lựa chọn chính.
   - **Tương tác di chuột / chạm (`:hover`):** Tăng nhẹ độ sáng (`opacity: 0.82`, `filter: none`) để người dùng nhận diện phản hồi tức thì trước khi chọn.

---

## 🎨 ĐIỀU 5: QUY CHUẨN BỘ LỌC MÀU (CHỈ DUY NHẤT 3 BỘ LỌC)
Hệ thống cố định **CHÍNH XÁC 3 BỘ LỌC MÀU**, tuyệt đối không tự ý thêm các filter khác:
1. **Tự nhiên (GỐC):**
   - `id`: `normal`
   - `cssFilter`: `none`
   - `previewColor`: `#ffffff`
2. **Cổ điển B&W (CỔ ĐIỂN):**
   - `id`: `vintage_noir`
   - `cssFilter`: `grayscale(100%) contrast(1.18) brightness(1.05)`
   - `previewColor`: `#334155`
3. **Retro 90s (RETRO):**
   - `id`: `retro_90s`
   - `cssFilter`: `sepia(0.28) contrast(1.14) brightness(1.02) saturate(1.28)`
   - `previewColor`: `#d97706`

---

## 🏷️ ĐIỀU 6: QUY CHUẨN THƯƠNG HIỆU & MÀU SẮC (BRANDING & PALETTE)
1. **Quy tắc viết hoa/thường thương hiệu:**
   - Tên thương hiệu **`fotolism`** luôn **viết thường toàn bộ** (lowercase branding). Tuyệt đối không viết `Fotolism` hay `FOTOLISM` trừ trường hợp logo typography hoa dạng biểu trưng.
2. **Bảng 3 màu chủ đạo Warm Minimalist Luxury:**
   - **Màu nhấn / Nâu đậm Studio:** `#351A10` (dùng cho nút chính, viền active, text tiêu đề).
   - **Màu nền kem nhạt:** `#FAF7F2` (dùng cho toàn bộ background trang).
   - **Màu pastel ấm:** `#F2D8D0` (dùng cho banner giá in thêm, highlight).

---

## 🔣 ĐIỀU 7: QUY CHUẨN ICON (LUCIDE REACT ICONOGRAPHY)
1. **100% sử dụng bộ icon Lucide React (`lucide-react`):**
   - Mọi icon trên toàn bộ giao diện Kiosk bắt buộc dùng vector SVG từ thư viện `lucide-react` với độ dày nét `strokeWidth={2}` đến `strokeWidth={2.2}`.
   - Các icon chuẩn quy định:
     - Dải ảnh in: `<ImageIcon size={18} strokeWidth={2.2} />`
     - Video Timelapse: `<Film size={18} strokeWidth={2.2} />`
     - In ảnh: `<Printer size={20} strokeWidth={2.2} />`
     - Quét QR: `<QrCode size={22} strokeWidth={2.2} />`
     - Tải tệp: `<Download size={18} strokeWidth={2.2} />`
     - Ảnh mẫu placeholder: `<Camera size={16} strokeWidth={2} />`
2. **CẤM TUYỆT ĐỐI DÙNG EMOJI HỆ ĐIỀU HÀNH TRÊN UI:**
   - Tuyệt đối không dùng emoji (như `🖼️`, `🎬`, `🖨️`, `📸`, `🌸`, `✨`) làm biểu tượng giao diện người dùng.
   - Emoji hệ điều hành có màu sắc hoạt hình sặc sỡ và biến dạng khác nhau giữa các phiên bản Windows/trình duyệt, làm phá vỡ phong cách sang trọng và tối giản của Fotolism.

