---
trigger: glob
globs: "{desktop/src/**,cms/src/**}"
description: Quy chuẩn UI fotolism.
---

# Quy chuẩn UI fotolism

- Tuân thủ thiết kế tham chiếu hiện có; không tự thay đổi design system.
- Phong cách Warm Minimalist Luxury; thương hiệu luôn viết `fotolism`.
- Dùng token màu hiện có: espresso #502A1D, kem #FAF6F1,
  trắng #FFFFFF, hồng phụ #F2D8D0; viền chọn #351A10.
- Chỉ dùng Lucide React cho icon; không dùng emoji.
- Không thêm mô tả/phụ đề dưới tiêu đề chính.
- Không dùng đường phân cách header/footer; giữ nền liền mạch.

## Kiosk
- Điều hướng đáy: `Quay lại` bên trái; `Tiếp tục` hoặc `Bắt đầu`
  bên phải. Cách đáy và hai bên tối thiểu 100px.
- Nút điều hướng chỉ chứa nhãn trên, không icon hoặc giá.
- Chọn Layout: mục đang chọn opacity 1; mục còn lại 0.38–0.42.
- Xác nhận đơn hàng: không thêm tag thừa hoặc viền nét đứt.
- ThemeSelectScreen bám sát reference-ui và ConnectedReferenceView.
- Giá và bước nhảy số lượng lấy từ cấu hình/constants.ts;
  không hardcode trong component.