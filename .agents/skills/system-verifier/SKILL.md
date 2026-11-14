---
name: system-verifier
description: Trợ lý chuyên kiểm thử tự động, ra lệnh và đối soát xác minh toàn diện từng phân hệ (Canon Daemon 8899, Desktop Kiosk 5173, Cloud CMS 3000, SQLite SessionDB, Đối soát 3 bên) trong Fotolism 3.0.
---

# 🛠️ Fotolism System Verifier Skill — Fotolism 3.0

Skill chuyên sâu phục vụ công tác **ra lệnh điều phối (command orchestration)** và **xác minh tự động (automated verification)** toàn diện tất cả các phân hệ phần mềm và phần cứng trong hệ sinh thái Fotolism Photobooth.

---

## 1. Bản Đồ Phân Phối Cổng Mạng (Port Allocation)

Đảm bảo độc lập tài nguyên, không xảy ra xung đột cổng trên cùng máy trạm Windows:

| Phân hệ | Cổng (Port) | Công nghệ | URL Kiểm Tra Sức Khỏe |
| :--- | :---: | :--- | :--- |
| **Canon Camera Daemon** | `8899` | C#/.NET x64 Persistent Daemon | `http://127.0.0.1:8899/status` |
| **Desktop Kiosk UI** | `5173` | Electron + React 19 + Vite | `http://localhost:5173` |
| **Cloud CMS Backoffice** | `3000` | Next.js 16 (App Router) + REST API | `http://localhost:3000/api/system/health` |
| **AI Enhance Service** | `8000` | Python FastAPI + OpenCV/PyTorch | `http://localhost:8000/docs` |

---

## 2. Lệnh Thực Thi Kiểm Tra Tức Thì

### 1. Kiểm tra toàn hệ thống (All-in-One Verification Script):
```powershell
# Chạy từ thư mục gốc f:\Fotolism
npm run verify

# Hoặc thực thi trực tiếp script kiểm tra:
node .agents/skills/system-verifier/scripts/verify-all.mjs
```

### 2. Chạy toàn bộ Test Suites tự động:
```powershell
# Chạy unit & integration tests trong Kiosk Desktop:
npm --prefix desktop run test

# Chạy 51 unit tests đối soát kế toán & API trong Cloud CMS:
npm --prefix cms test
```

---

## 3. Các Hạng Mục Xác Minh Tự Động Chi Tiết

### ① Xác minh Canon Camera Daemon (Cổng 8899)
- **Lệnh**: `curl.exe -s http://127.0.0.1:8899/status`
- **Tiêu chuẩn đạt**:
  - `connected: true`: Máy ảnh Canon EOS R100 kết nối session EDSDK thành công.
  - `evfReady: true`: Bộ đệm EVF đang nhận frame 960x640 liên tục.
  - `cameraState`: `LIVEVIEW` hoặc `READY`.
  - `fps`: Dao động ổn định từ 20.0 đến 33.0 FPS.

### ② Xác minh Cơ sở dữ liệu SQLite SessionDB
- **Vị trí**: `desktop/electron/sessionDatabase.cts`
- **Tiêu chuẩn đạt**:
  - Tự động tạo và bảo vệ 5 bảng: `Sessions`, `Captures`, `MediaFiles`, `PrintJobs`, `UploadTasks`.
  - Hỗ trợ lưu trữ trạng thái chụp có Idempotency (`COMPLETED`, `FAILED`, `PENDING`) và hàng đợi upload R2 (`r2UploadWorker.cts`).

### ③ Xác minh AI Beauty Service & Queue (Cổng 8000)
- **Vị trí**: `desktop/ai-service/main.py`, `desktop/ai-service/core/korean_beauty_engine.py`, `desktop/electron/aiEnhanceQueue.cts`
- **Tiêu chuẩn đạt**:
  - Service FastAPI sẵn sàng trên cổng `8000`, hàng đợi `AiEnhanceQueue` và kiểm tra toàn vẹn `enhanceIntegrity.cts` đầy đủ.

### ④ Xác minh Phân hệ Desktop Kiosk (Cổng 5173)
- **Lệnh build**: `npm --prefix desktop run build`
- **Tiêu chuẩn đạt**:
  - 0 lỗi TypeScript (`tsc -b`), 0 lỗi Vite bundle.
  - Preload ContextIsolation an toàn phơi bày các bridge: `camera`, `printer`, `session`, `storage`, `window`.

### ⑤ Xác minh Đối soát Kế toán 3 góc (Triple Reconciliation)
- **Vị trí**: `cms/src/lib/reconciliation/engine.ts`
- **Test suite**: `cms/tests/priority2-system.test.ts`
- **Tiêu chuẩn đạt**:
  - Đối chiếu khớp 100% giữa: Doanh thu VietQR ngân hàng ⇄ Tiền mặt tại quầy ⇄ Định mức tiêu hao giấy in DNP RX1HS.

