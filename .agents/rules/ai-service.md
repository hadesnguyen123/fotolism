---
trigger: glob
globs: "{desktop/ai-service/**,desktop/electron/aiEnhanceQueue.cts,desktop/electron/enhanceIntegrity.cts}"
description: Quy chuẩn an toàn AI Beauty Service (Port 8000), bảo toàn ảnh gốc và hàng đợi xử lý Fotolism 3.0.
---

# FOTOLISM 3.0 — AI BEAUTY SERVICE RULES

1. **Bảo toàn ảnh gốc & Không chặn luồng chính**:
   - Luôn giữ nguyên file ảnh gốc (24MP từ Canon) trước khi chạy xử lý làm đẹp.
   - Lỗi từ AI Service (`127.0.0.1:8000`) **tuyệt đối không được chặn** quy trình chụp, ghép khung hoặc in ảnh tại Kiosk (fallback về ảnh gốc nếu AI lỗi hoặc timeout).
2. **Hàng đợi & Toàn vẹn dữ liệu**:
   - Mọi tác vụ gọi AI từ Electron phải đi qua `AiEnhanceQueue` (`aiEnhanceQueue.cts`) để giới hạn CPU/RAM và gộp request trùng key.
   - Kiểm tra toàn vẹn file đầu ra bằng `enhanceIntegrity.cts` trước khi đưa vào ghép khung/in/upload R2.
3. **Kiến trúc xử lý hiện hành**:
   - Tầng Server-Side dùng `korean_beauty_engine.py`, `selective_spot_correction.py`, `white_balance.py`, `lut_manager.py` và `face_detection_yunet_2023mar.onnx`.
   - Chạy test tại `desktop/ai-service/tests/` khi thay đổi thuật toán xử lý ảnh.

