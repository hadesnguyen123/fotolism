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
- UI touch-first, tối giản, dùng Lucide Icons; **tuân thủ thiết kế tham chiếu có sẵn**, không tự thay đổi design system.
- Không tự ý thay đổi giá, thanh toán, quy tắc in, schema, API contract hoặc kiến trúc.

## 3. Thực thi
- Xác định phạm vi; ưu tiên minimal diff và tái sử dụng code.
- Không refactor, thêm dependency hoặc sửa ngoài phạm vi.
- Không tự commit, push, deploy.
- Chỉ hỏi khi thiếu thông tin quan trọng hoặc có rủi ro cao.
- Chỉ dùng subagent cho task độc lập, đủ lớn; phân chia file ownership, tránh xung đột và test trùng.

## 4. Kiểm thử
- UI/CSS/Text: kiểm tra diff; kiểm tra trực quan khi khả thi.
- Logic/API: test đúng module bị ảnh hưởng.
- Camera/AI: test chuyên biệt khi có môi trường.
- Không tự chạy full build/test/verify; không chạy lại test PASS khi code liên quan không đổi.
- Không báo PASS nếu chưa thực sự kiểm tra.

## 5. Báo cáo
Trả lời ngắn gọn bằng tiếng Việt, chỉ gồm:
- **Đã thay đổi**
- **Đã kiểm tra**
- **Vấn đề còn lại**

**Nguyên tắc: Ít context → Sửa tối thiểu → Test đúng phạm vi.**