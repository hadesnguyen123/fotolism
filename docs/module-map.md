# FOTOLISM 3.0 — MODULE MAP & AGENT NAVIGATION GUIDE

Tài liệu định vị nhanh cho Coding Agent (Antigravity / Cursor) nhằm tối ưu hóa chi phí Context Token.

---

## 1. Nguyên Tắc Điều Hướng (Navigation Heuristics)

1. **Tra cứu Symbol/Function trước**: Sử dụng công cụ grep hoặc targeted read thay vì nạp toàn bộ thư mục.
2. **Bắt đầu từ Primary Entry Point**: Luôn mở file Entry Point tương ứng với nghiệp vụ trước tiên.
3. **Tra cứu Dependency có định hướng**: Chỉ đọc các file trong danh sách liên đới khi hàm cần sửa trực tiếp gọi tới chúng.
4. **Không nạp file thuộc domain khác**: Tránh đọc các file CSS không liên quan hoặc các module nằm ngoài phạm vi nghiệp vụ.

---

## 2. Ma Trận Ánh Xạ Nghiệp Vụ & Entry Points

| Nghiệp vụ chính | Primary Entry Point (Đọc trước) | Dependencies liên đới (Chỉ đọc khi cần) | Vùng KHÔNG cần đọc |
| :--- | :--- | :--- | :--- |
| **Canon Camera & LiveView** | `desktop/native-daemon/CanonDaemon.cs`<br/>`desktop/electron/ipc/cameraIpc.cts`<br/>`desktop/src/screens/CaptureScreen.tsx` | `desktop/native-daemon/EdsdkNative.cs`<br/>`desktop/src/components/BeautyCameraView.tsx`<br/>`desktop/src/components/capture/CaptureAspectGuide.tsx` | `cms/`, `PaymentScreen.tsx`, `canvasCompositor.ts` |
| **Khung ảnh, Crop & In ấn** | `desktop/src/lib/canvasCompositor.ts`<br/>`desktop/src/screens/ReviewScreen.tsx` | `desktop/electron/ipc/printerIpc.cts`<br/>`desktop/src/components/review/InteractiveStripPreview.tsx`<br/>`desktop/src/screens/ReviewScreen.css` | `desktop/ai-service/`, `CanonDaemon.cs`, `cms/` |
| **Làm đẹp chân dung (AI)** | `desktop/ai-service/api/routes/enhance.py`<br/>`desktop/src/services/beautyEngine.ts` | `desktop/ai-service/core/korean_beauty_engine.py`<br/>`desktop/src/lib/faceDetector.ts` | `cms/`, `printerIpc.cts`, `ReviewScreen.tsx` |
| **Thanh toán & Thu ngân POS**| `desktop/src/screens/PaymentScreen.tsx`<br/>`cms/src/app/pos/page.tsx` | `cms/src/app/api/pricing/route.ts`<br/>`cms/src/lib/data/store.ts` | `CanonDaemon.cs`, `canvasCompositor.ts`, `ai-service/` |
| **Quản trị Thiết bị / Kiosk** | `cms/src/app/devices/page.tsx`<br/>`cms/src/app/devices/hooks/useDeviceManager.ts` | `cms/src/app/devices/components/KiosksTab.tsx`<br/>`desktop/src/services/cloudSyncService.ts` | `desktop/src/lib/canvasCompositor.ts`, `ai-service/` |
| **Bảng giá, Voucher & Gói chụp** | `cms/src/app/pricing/page.tsx`<br/>`cms/src/app/pricing/hooks/usePricingManager.ts` | `cms/src/app/pricing/components/PackagesTab.tsx`<br/>`desktop/src/config/coupons.ts` | `CanonDaemon.cs`, `BeautyCameraView.tsx` |
| **Đồng bộ Offline ➔ Online** | `desktop/src/services/cloudSyncService.ts`<br/>`desktop/electron/sessionDatabase.cts` | `cms/src/app/api/kiosk/sessions/route.ts`<br/>`desktop/electron/ipc/sessionIpc.cts` | UI CSS files, `ai-service/` |

---

## 3. Bản Đồ Cấu Trúc Thư Mục Tối Giản

```
f:\Fotolism\
├── desktop/                        # Electron + React Kiosk Client (Port 5173)
│   ├── electron/                   # Electron Main Process & Native Bridges
│   │   ├── main.cts                # Window lifecycle & IPC Handlers
│   │   ├── preload.cts             # Context isolation bridge
│   │   └── sessionDatabase.cts     # SQLite local session persistence
│   ├── native-daemon/              # C# 64-bit Canon EDSDK Daemon (Port 8899)
│   │   ├── CanonDaemon.cs          # P/Invoke, Session lifecycle, Live View & Shutter
│   │   └── build.ps1               # Script biên dịch csc.exe 64-bit
│   ├── ai-service/                 # Python FastAPI Offline AI Engine (Port 8000)
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── api/routes/             # /enhance, /camera, /composite routes
│   │   └── core/                   # Korean beauty algorithms & LUT managers
│   └── src/                        # React Frontend Source
│       ├── components/             # Reusable UI widgets
│       ├── screens/                # Flow màn hình chính của Kiosk
│       ├── lib/                    # Canvas compositor, API bridges, constants
│       ├── services/               # Beauty engine, Cloud sync service
│       └── store/                  # Zustand state management
├── cms/                            # Next.js 16 Cloud CMS & POS (Port 3000)
│   └── src/
│       ├── app/                    # Next.js App Router pages (/pos, /devices, /pricing)
│       ├── components/             # CMS Shared UI components
│       └── lib/                    # Supabase clients & local data store
└── docs/                           # Tài liệu kiến trúc và bản đồ module
    ├── architecture.md             # Kiến trúc tổng quan & Data flow
    ├── module-map.md               # Bản đồ điều hướng Agent (file này)
    └── benchmark-baseline.md       # Đo lường Input/Output tokens
```
