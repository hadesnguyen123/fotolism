---
trigger: always_on
description: Quy chuẩn phát triển phần mềm, quy trình kiểm thử, lệnh thực thi và kỷ luật Git cho Fotolism 3.0.
---

# FOTOLISM 3.0 — DEVELOPMENT WORKFLOW & CODING STANDARDS

Tài liệu quy định chi tiết quy trình viết mã nguồn, kiểm thử tự động và kỷ luật an toàn trong toàn bộ dự án Fotolism.

---

## 1. Quy Trình Phát Triển Mã Nguồn (Development Workflow)

1. **Hiểu rõ yêu cầu trước khi sửa mã**:
   - Xác định rõ mục tiêu, các module bị ảnh hưởng, ràng buộc kỹ thuật và tiêu chí nghiệm thu trước khi bắt đầu chỉnh sửa.
   - Luôn kiểm tra mã nguồn hiện có và tuân theo convention đã thiết lập.
2. **Thay đổi tối thiểu và an toàn (Minimal Safe Changes)**:
   - Thực hiện thay đổi nhỏ nhất nhưng giải quyết trọn vẹn yêu cầu.
   - Không sửa các file hoặc module không liên quan.
   - Không tự ý tái cấu trúc (refactor) mã nguồn đang hoạt động ổn định nếu không có lý do xác đáng hoặc không được yêu cầu.
   - Bảo toàn tương thích ngược cho IPC channels và API routes.
3. **Tái sử dụng tài nguyên sẵn có**:
   - Tái sử dụng hằng số từ `desktop/src/lib/constants.ts` và các cấu hình nghiệp vụ trong CMS.
   - Tuyệt đối không cài thêm thư viện phụ thuộc (`npm install`) mới nếu không có lý do kỹ thuật rõ ràng.

---

## 2. Kỷ Luật Git & An Toàn Môi Trường (Git & Safety Discipline)

* **Tuyệt đối không tự ý commit / push**: Chỉ thực hiện `git commit` hoặc `git push` khi người dùng yêu cầu rõ ràng.
* **Không tự ý triển khai (deploy)**: Không chạy các lệnh deploy hoặc sửa đổi cấu hình production mà không có sự đồng ý tường minh.
* **Thao tác rủi ro cao**: Các thay đổi liên quan đến thanh toán (VietQR/Casso/SePay), di chuyển cơ sở dữ liệu (Supabase migrations), và vòng đời phần cứng bắt buộc phải trình bày kế hoạch trước khi thực thi.

---

## 3. Danh Mục Lệnh Thực Thi Tiêu Chuẩn (Standard Commands)

Mọi lệnh sau đã được xác minh hoạt động chính xác trong `package.json`:

```powershell
# 1. Kiểm tra sức khỏe toàn diện hệ thống (Port, IPC, Database, Daemon)
npm run verify

# 2. Chạy toàn bộ test suites trong dự án (Desktop + CMS)
npm test

# 3. Chạy riêng test suite Cloud CMS (Vitest 51 tests)
npm --prefix cms test

# 4. Chạy riêng test suite Kiosk Desktop (Vitest 55 tests)
npm --prefix desktop test

# 5. Biên dịch sản phẩm Next.js CMS
npm --prefix cms run build

# 6. Biên dịch ứng dụng Desktop Electron
npm --prefix desktop run build
```

---

## 4. Báo Cáo Nghiệm Thu Chuẩn Mực

Sau khi hoàn tất bất kỳ thay đổi nào, chỉ báo cáo súc tích 3 nội dung:
1. **Nội dung đã thay đổi**: Tên file và tính năng được cập nhật.
2. **Kết quả xác minh**: Lệnh test/build đã chạy kèm trạng thái PASS cụ thể (không bao giờ báo cáo PASS nếu chưa chạy).
3. **Rủi ro hoặc vấn đề tồn đọng**: Bất kỳ điểm lưu ý hoặc bước cần người dùng quyết định tiếp theo.

