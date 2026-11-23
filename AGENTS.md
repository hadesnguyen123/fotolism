# Fotolism 3.0 — Agent Rules

## 1. Context
- `desktop/`: Electron + React — Kiosk.
- `desktop/native-daemon/`: C#/.NET — Canon EDSDK.
- `desktop/ai-service/`: Python FastAPI — AI.
- `cms/`: Next.js + Supabase — CMS/POS.
- `docs/module-map.md`: Định vị mã nguồn.
- `docs/architecture.md`: Kiến trúc hệ thống.
- Chỉ đọc tài liệu khi cần. **Search → Read → Edit → Verify**. Không quét toàn repo; chỉ truy vết dependency liên quan.

## 2. Bất biến
- Kiosk offline-first; Cloud Sync dùng Outbox + retry idempotent.
- Canon Daemon độc quyền EDSDK session; chụp tuần tự, chống trùng `captureId`.
- Bảo toàn ảnh gốc; lỗi AI không được chặn chụp/in.
- **Selfbooth 9:16 & Live View 3:4:** Tất cả các màn hình ở chế độ Selfbooth phải cố định tỉ lệ màn hình dọc `9:16` (không chuyển sang giao diện ngang `16:9`), và Live View / ảnh chụp Selfbooth cố định tỉ lệ `3:4`.
- **Luôn bật gương (Mirror):** Cả Photobooth và Selfbooth bắt buộc luôn bật gương — Live View phải bật gương, ảnh chụp xong phải bật gương, và kết quả (xem lại, ghép/lưu, tải lên, in ấn) phải bật gương khớp Live View.
- UI touch-first, tối giản, dùng Lucide Icons; **tuân thủ thiết kế tham chiếu có sẵn**, không tự thay đổi design system.
- **Photobooth — Quy tắc in ấn & giá mặc định:**
  - `2x6`: mặc định in **2 dải** (in 1 lần khổ 4x6 cắt đôi); in thêm **30.000đ / 2 tấm** (`extraStep = 2`).
  - `4x6 (4 ảnh)` và `4x6 (9 ảnh)`: mặc định in **2 tấm**; in thêm **30.000đ / 1 tấm lớn** (`extraStep = 1`).
  - Số bản in chỉ được thiết lập ở màn **Kiểm tra thông tin** (`ConfirmScreen`), **không được phép thay đổi** tại màn **In ảnh** (`ReviewScreen` / `PrintActionDeck`).
- Không tự ý thay đổi giá, thanh toán, quy tắc in, schema, API contract hoặc kiến trúc.

## 3. Thực thi
- Xác định phạm vi; ưu tiên minimal diff và tái sử dụng code.
- Không refactor, thêm dependency hoặc sửa ngoài phạm vi.
- Không tự commit, push, deploy.
- Chỉ hỏi khi thiếu thông tin quan trọng hoặc có rủi ro cao.
- Chỉ dùng subagent cho task độc lập, đủ lớn; phân chia file ownership, tránh xung đột và test trùng.

## 4. Code Standards
- **File:** Header ngắn mô tả mục đích và dependency chính (nếu có).
- **Function:** Comment mô tả nghiệp vụ, tham số, kết quả và side effects khi cần.
- **Format:** TypeScript/JS dùng JSDoc; C# dùng XML Docs; Python dùng Docstring.
- **Language:** Comment tiếng Việt; tên biến/hàm/class tiếng Anh.
- **Rules:** Giải thích WHY thay vì WHAT; không comment logic hiển nhiên, không comment từng dòng.
- **Maintenance:** Cập nhật comment khi sửa logic; không tự thêm comment hàng loạt hoặc ngoài phạm vi task.

## 5. Kiểm thử
- UI/CSS/Text: kiểm tra diff; kiểm tra trực quan khi khả thi.
- Logic/API: test đúng module bị ảnh hưởng.
- Camera/AI: test chuyên biệt khi có môi trường.
- Không tự chạy full build/test/verify; không chạy lại test PASS khi code liên quan không đổi.
- Không báo PASS nếu chưa thực sự kiểm tra.

## 6. Báo cáo
Trả lời ngắn gọn bằng tiếng Việt, chỉ gồm:
- **Đã thay đổi**
- **Đã kiểm tra**
- **Vấn đề còn lại**

**Nguyên tắc: Ít context → Sửa tối thiểu → Test đúng phạm vi.**