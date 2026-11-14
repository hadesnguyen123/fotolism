---
name: face-enhance-ai
description: Hướng dẫn tích hợp AI làm đẹp khuôn mặt kép: WebGL MediaPipe thời gian thực (30 FPS) và AI phục hồi nét chân dung 24MP (GFPGAN/CodeFormer) cho Fotolism 3.0.
---

# 🤖 Face Enhance AI Skill — Fotolism 3.0

Hướng dẫn chuẩn hóa pipeline công nghệ làm đẹp chân dung AI kép (Dual-Engine AI Beautification) trong Fotolism Photobooth:
1. **Tầng 1 (Live Preview):** Bộ lọc WebGL Shader thời gian thực kết hợp MediaPipe FaceMesh (30 FPS không trễ).
2. **Tầng 2 (Post-Processing):** AI phục hồi nét chân dung 24MP chi tiết cao (GFPGAN / CodeFormer) cho bản in và tải về.

---

## 1. Tầng 1: WebGL Real-time Beauty Shader (Client-Side)

Hoạt động trực tiếp trên màn hình xem trước [BeautyCameraView.tsx](file:///f:/Fotolism/desktop/src/components/BeautyCameraView.tsx) bằng GPU WebGL, không chiếm CPU:

```
┌─────────────────────────────────┐
│     Live Video / MJPEG Frame    │
└────────────────┬────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│      MediaPipe FaceLandmarker (@mediapipe/tasks-vision)│
│  - Theo dõi 468 điểm mốc khuôn mặt thời gian thực      │
│  - Trích xuất tọa độ xương hàm, chóp mũi, cằm          │
└────────────────┬───────────────────────────────────────┘
                 │ (Truyền Uniforms vào Fragment Shader)
                 ▼
┌────────────────────────────────────────────────────────┐
│            Custom WebGL Fragment Shader                │
│  - V-Line Slimming: Co nhẹ xương hàm về trục giữa mặt  │
│  - YCbCr Skin Mask: Nhận diện da người chuẩn xác       │
│  - Bilateral Filter: Làm mịn da nhưng giữ nguyên nét mắt│
│  - Whitening & Rosy: Nâng tông trắng hồng tự nhiên     │
│  - Contrast Clarity: Tăng cường sắc nét cạnh viền      │
└────────────────────────────────────────────────────────┘
```

### Các thông số tinh chỉnh người dùng (0 - 100%):
- `slimFace`: Thon gọn cằm V-line theo tracking vị trí mặt thật.
- `skinSmoothing`: Làm mịn bề mặt da, xóa mụn tàn nhang nhẹ.
- `whiteningTone`: Nâng tông sáng tự nhiên.
- `rosyTone`: Ám sắc hồng hào gò má và môi.
- `glowClarity`: Tăng độ tương phản viền và độ trong của mắt.

---

## 2. Tầng 2: AI Beauty & Face Enhancement Cho Ảnh 24MP (Server-Side / Offline)

Được kích hoạt sau khi chụp ảnh để xuất bản in và gallery chất lượng cao nhất:

- **Dịch vụ**: Python FastAPI (`desktop/ai-service/main.py`) chạy cục bộ trên cổng `8000`.
- **Pipeline xử lý thực tế**:
  - `face_detection_yunet_2023mar.onnx`: Nhận diện khuôn mặt nhanh và chính xác.
  - `core/korean_beauty_engine.py`: Làm mịn da, cân chỉnh tông trắng hồng Hàn Quốc tự nhiên, giữ chi tiết mắt/môi/tóc.
  - `core/selective_spot_correction.py`: Xử lý khuyết điểm cục bộ có chọn lọc.
  - `core/white_balance.py` & `core/lut_manager.py`: Cân bằng trắng và áp LUT màu chuẩn studio.
- **Hàng đợi & Toàn vẹn dữ liệu (Electron)**:
  - `desktop/electron/aiEnhanceQueue.cts` (`AiEnhanceQueue`): Giới hạn CPU/RAM và gộp request trùng key.
  - `desktop/electron/enhanceIntegrity.cts`: Xác thực file đầu ra hợp lệ; nếu AI lỗi hoặc timeout, fallback an toàn về ảnh gốc để không chặn chụp/in.

---

## 3. Quy Tắc Tối Ưu Hiệu Năng & Phần Cứng Kiosk

1. **Có GPU rời NVIDIA (GeForce RTX / GTX)**:
   - Sử dụng TensorRT hoặc ONNX Runtime CUDA Execution Provider.
   - Thời gian xử lý ảnh 24MP: **< 1.0 giây**.
2. **Chỉ có CPU / GPU tích hợp (Intel Iris Xe / AMD Radeon)**:
   - Kích hoạt chế độ **CPU Fast-Enhance Pipeline**:
     - Sử dụng OpenCV `bilateralFilter` hoặc `edgePreservingFilter` trên không gian màu Lab.
     - Chạy inference khuôn mặt với ONNX INT8 quantized model.
     - Thời gian xử lý đảm bảo: **< 2.2 giây**, không để khách hàng chờ đợi lâu trước màn hình.
3. **Bảo tồn độ sắc nét của tóc và trang phục**:
   - Chỉ áp dụng AI phục hồi trên vùng mặt được crop từ bounding box MediaPipe.
   - Ghép khuôn mặt đã làm đẹp trở lại ảnh gốc 24MP bằng mặt nạ lông chim (feathering alpha blending), đảm bảo tóc, quần áo và phông nền giữ nguyên 100% độ sắc nét quang học của máy ảnh Canon EOS.
