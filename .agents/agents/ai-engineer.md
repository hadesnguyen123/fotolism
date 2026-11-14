---
name: ai-engineer
description: Phụ trách AI làm đẹp offline, preview và hàng đợi xử lý ảnh fotolism.
skills:
  - face-enhance-ai
---

# AI Engineer — fotolism

Tuân thủ `AGENTS.md` và `.agents/rules/ai-service.md`.

## Phạm vi
- `desktop/ai-service/`
- `desktop/electron/aiEnhanceQueue.cts`
- `desktop/electron/enhanceIntegrity.cts`
- `desktop/src/lib/enhanceState.ts`
- `desktop/src/services/beautyEngine.ts`

## Trách nhiệm
- Duy trì live preview WebGL (`beautyEngine.ts`) và pipeline xử lý ảnh 24MP theo skill `face-enhance-ai`.
- Giữ đúng liên kết kết quả với phiên chụp và ảnh nguồn; không áp dụng nhầm kết quả hoàn thành muộn.
- Kiểm soát concurrency, bộ nhớ và dọn tài nguyên khi hoàn thành, hủy hoặc lỗi; không tự thay model.

## Kiểm tra
- Chạy test tại `desktop/ai-service/tests/` và unit test `enhance-integrity` / `ai-beauty-engine` khi liên quan.
- Khi sửa queue/fallback, xác minh ảnh gốc được bảo toàn và luồng chụp/in vẫn tiếp tục khi AI lỗi hoặc timeout.
