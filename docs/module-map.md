# FOTOLISM 3.0 — BẢN ĐỒ MODULE & HƯỚNG DẪN ĐIỀU HƯỚNG AGENT

> Tài liệu định vị mã nguồn dành cho Coding Agent (Antigravity/Cursor).
> **Mục tiêu:** Giảm lượng context token tiêu thụ, định vị đúng mã nguồn và tránh đọc các file không cần thiết.

## 1. Nguyên tắc điều hướng

1. **Xác định nghiệp vụ:** Xác định module liên quan trước khi đọc mã nguồn.
2. **Tìm kiếm trước:** Ưu tiên tìm theo tên file, symbol hoặc function.
3. **Đọc có chọn lọc:** Chỉ đọc hàm hoặc đoạn mã liên quan trực tiếp.
4. **Truy vết khi cần:** Chỉ mở rộng sang các file import, caller hoặc dependency khi cần thiết.
5. **Giới hạn phạm vi:** Không đọc module khác nếu luồng xử lý không liên quan.
6. **Xác minh đường dẫn:** Kiểm tra file tồn tại trước khi đọc vì bản đồ có thể chưa được cập nhật.
7. **Tránh quét toàn bộ:** Không đọc đệ quy toàn bộ thư mục hoặc repository mặc định.
8. **Tái sử dụng context:** Không đọc lại những file đã kiểm tra nếu nội dung không thay đổi.

## 2. Bản đồ nghiệp vụ và điểm vào mã nguồn

### 2.1. Camera & LiveView

| Nghiệp vụ | File chính |
|---|---|
| Quản lý EDSDK, session, chụp ảnh và LiveView | `desktop/native-daemon/CanonDaemon.cs` |
| Giao tiếp Camera IPC | `desktop/electron/ipc/cameraIpc.cts` |
| Giao diện chụp ảnh | `desktop/src/screens/CaptureScreen.tsx` |
| Làm đẹp LiveView | `desktop/src/components/BeautyCameraView.tsx` |
| Hướng dẫn tỷ lệ khung hình | `desktop/src/components/capture/CaptureAspectGuide.tsx` |
| Khai báo Native EDSDK | `desktop/native-daemon/EdsdkNative.cs` |

### 2.2. Khung ảnh, Crop & In ấn

| Nghiệp vụ | File chính |
|---|---|
| Ghép khung ảnh, crop | `desktop/src/lib/canvasCompositor.ts` |
| Luồng xem lại ảnh | `desktop/src/screens/ReviewScreen.tsx` |
| Giao tiếp máy in | `desktop/electron/ipc/printerIpc.cts` |
| Xem trước ảnh strip | `desktop/src/components/review/InteractiveStripPreview.tsx` |

### 2.3. AI Beauty Engine

| Nghiệp vụ | File chính |
|---|---|
| API xử lý ảnh | `desktop/ai-service/api/routes/enhance.py` |
| Thuật