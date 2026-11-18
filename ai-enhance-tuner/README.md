# Fotolism AI Enhance Tuner

Dự án tách độc lập từ `desktop/ai-service` để **import ảnh**, **tinh chỉnh các thông số AI Enhance**, nhấn **Apply** để xem thay đổi trực tiếp (Split / Song song / Soi gốc), và **Export** đoạn cấu hình Python/JSON để áp dụng ngược lại vào `desktop/ai-service`.

## Cách chạy nhanh (1 cửa sổ)

1. Cài frontend & build (chỉ cần làm 1 lần hoặc khi sửa UI):
   ```powershell
   cd f:\Fotolism\ai-enhance-tuner\frontend
   npm install
   npm run build
   ```
2. Chạy server (phục vụ cả API + UI trên cổng `8010`, không xung đột với `ai-service` cổng `8000`):
   ```powershell
   cd f:\Fotolism\ai-enhance-tuner\backend
   python main.py
   ```
   Sau đó mở trình duyệt tại: `http://127.0.0.1:8010` (hoặc chạy `start.bat`).

## Chạy chế độ Dev (Hot-reload UI)

- Terminal 1: `cd backend && python main.py`
- Terminal 2: `cd frontend && npm run dev` → mở `http://localhost:5180`

## Áp dụng thông số đã chọn vào `ai-service`

1. Tinh chỉnh các thanh thông số và nhấn **Apply thay đổi lên ảnh** để kiểm tra.
2. Nhấn **Export cho ai-service** ở góc trên bên phải để xem các chỉ số đã thay đổi và copy đoạn code Python dán vào `desktop/ai-service/core/korean_beauty_engine.py` (hoặc `desktop/ai-service/api/routes/enhance.py`).
