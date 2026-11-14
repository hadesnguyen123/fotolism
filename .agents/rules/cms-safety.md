---
trigger: glob
globs: "{cms/**,desktop/src/services/cloudSyncService.ts,desktop/electron/r2UploadWorker.cts}"
description: Quy chuẩn an toàn Cloud CMS, Supabase RLS, đối soát 3 bên và đồng bộ Outbox/R2 Fotolism 3.0.
---

# FOTOLISM 3.0 — CLOUD CMS & SYNC SAFETY RULES

1. **Bảo mật Supabase & RLS**:
   - Mọi bảng nghiệp vụ (`branches`, `kiosks`, `sessions`, `ledger_transactions`) bắt buộc bật Row Level Security (RLS) và cô lập dữ liệu theo `branch_id`.
   - Không mở quyền truy cập ẩn danh hoặc bypass RLS trong API routes nếu không có xác thực `device_token` / session hợp lệ.
2. **Offline-First & Idempotent Sync**:
   - Mọi payload đồng bộ từ Kiosk (`cloudSyncService.ts`) phải đính kèm `kiosk_id`, `session_id`, `transaction_id` để CMS xử lý Idempotent Upsert, không tạo bản ghi trùng khi retry.
   - Upload ảnh/video qua Cloudflare R2 (`r2UploadWorker.cts`) quản lý trạng thái qua bảng `UploadTasks` trong SQLite, không làm nghẽn luồng chụp/in tại Kiosk.
3. **Thao tác rủi ro cao (Bắt buộc hỏi trước khi sửa)**:
   - Không tự ý thay đổi công thức đối soát 3 bên (`cms/src/lib/reconciliation/engine.ts`), webhook thanh toán VietQR (SePay/Casso), bảng giá mặc định, hoặc Supabase migrations (`cms/supabase/migrations/`).

