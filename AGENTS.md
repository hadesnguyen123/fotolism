# fotolism 3.0 — Hướng dẫn Antigravity

## 1. Kiến trúc
- `desktop/`: Electron + React, Kiosk (5173).
- `desktop/native-daemon/`: C#/.NET, Canon EDSDK (8899).
- `cms/`: Next.js + Supabase, CMS/POS (3000).
- `desktop/ai-service/`: Python FastAPI, AI Engine (8000).
- Tuân thủ kiến trúc, tái sử dụng code và Skills hiện có.

## 2. Quy tắc bất biến
- Kiosk hoạt động offline; dữ liệu đồng bộ Cloud qua Outbox và retry idempotent.
- Chỉ Canon Daemon quản lý EDSDK session; không đóng session sau mỗi lần chụp.
- Lệnh chụp xử lý tuần tự, chống trùng bằng `captureId`.
- UI touch-first, thương hiệu `fotolism`, thiết kế tối giản, sử dụng Lucide Icons.
- Không tự ý thay đổi bảng giá, quy tắc in ấn và thanh toán.

## 3. Tiếp nhận yêu cầu
- Xác định mục tiêu, phạm vi, ràng buộc và kết quả mong muốn.
- Chủ động đọc code và Skills liên quan, chỉ hỏi khi thực sự cần.
- Tác vụ đơn giản: thực hiện ngay.
- Tác vụ phức tạp: đề xuất kế hoạch ngắn trước khi triển khai.

## 4. Thực thi
- Chỉ sửa những gì cần thiết, không tự ý mở rộng hoặc refactor ngoài phạm vi.
- Ưu tiên giải pháp đơn giản, tái sử dụng thành phần hiện có.
- Không tự ý thay đổi kiến trúc, dependency, database schema hoặc dữ liệu quan trọng.
- Không tự commit, push hoặc deploy.
- Chỉ sử dụng Subagent khi thực sự cần.

## 5. Kiểm thử thông minh
- **UI/CSS/layout/text:** Chỉ kiểm tra diff; không chạy test/build mặc định.
- **Logic component:** Chỉ chạy test liên quan nếu có.
- **API/service:** Chỉ kiểm thử module bị ảnh hưởng.
- **Hardware/AI:** Kiểm thử chuyên biệt khi cần và có môi trường phù hợp.
- **Shared code/kiến trúc:** Đánh giá phạm vi ảnh hưởng trước khi kiểm thử.
- Không tự chạy full test suite, full build hoặc `npm run verify` khi chưa được chấp thuận.
- Không chạy lại test đã PASS nếu không có thay đổi liên quan.
- Không báo kiểm thử thành công nếu chưa thực sự chạy.

## 6. Báo cáo
- Trả lời ngắn gọn bằng tiếng Việt.
- Chỉ báo cáo: **Đã thay đổi — Đã kiểm tra — Vấn đề còn lại**.
- Không giải thích dài dòng hoặc tạo tài liệu khi không được yêu cầu.