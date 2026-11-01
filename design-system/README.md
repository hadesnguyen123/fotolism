# FOTOLISM DESIGN SYSTEM (DS-3.0)
> **Tài nguyên thiết kế dùng chung cho Hệ sinh thái Fotolism 3.0**

---

## 🏛️ LƯU Ý KIẾN TRÚC TÁCH BIỆT DỰ ÁN (PROJECT SEPARATION)

Hệ sinh thái Fotolism bao gồm **2 DỰ ÁN HOÀN TOÀN ĐỘC LẬP & TÁCH BIỆT**:

```
                          ┌────────────────────────┐
                          │  FOTOLISM DESIGN SYSTEM │
                          │ (Tokens, Colors, Themes│
                          └───────────┬────────────┘
                                      │ Tham chiếu tokens & phong cách
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │         DESKTOP           │             │         FOTOLISM          │
   │  (Kiosk Photobooth App)   │             │ (Cloud CMS & Backoffice)  │
   ├───────────────────────────┤             ├───────────────────────────┤
   │ • Electron Shell + React  │             │ • Next.js 16 + Tailwind   │
   │ • Canon EDSDK Daemon 64-b │             │ • Supabase PostgreSQL     │
   │ • AI Service cục bộ (8000)│             │ • SePay VietQR Webhook    │
   │ • Local SQLite (Offline)  │             │ • Đối soát 3 bên tập trung│
   │ • Máy trạm phần cứng quầy │             │ • Triển khai Cloud độc lập│
   └───────────────────────────┘             └───────────────────────────┘
```

1. **`desktop` (Trạm Kiosk Chụp Ảnh & Vận Hành Phần Cứng):**
   - Ứng dụng Desktop chạy trực tiếp trên máy tính Windows tại booth.
   - Trực tiếp tương tác phần cứng: Máy ảnh Canon EOS R100 qua Canon EDSDK Daemon (port 8899), máy in nhiệt dye-sub DNP RX1HS qua Windows Spooler, và dịch vụ AI phục hồi nét ảnh `desktop/ai-service` (port 8000).
   - Thiết kế chuẩn **Offline-First**: Mất mạng Internet Kiosk vẫn chụp ảnh và in ảnh bình thường; lưu phiên chụp vào SQLite cục bộ.

2. **`fotolism` (Cloud CMS & Trung Tâm Quản Trị Chuỗi — trước đây là `joybooth-cms`):**
   - Ứng dụng Web quản trị trung tâm xây dựng trên Next.js 16 và Supabase PostgreSQL.
   - Chịu trách nhiệm quản lý mạng lưới nhiều Kiosks, cấu hình bảng giá, voucher khuyến mãi, tiếp nhận Webhook ngân hàng SePay, đối soát tài chính 3 bên (Triple Reconciliation) và phân phối tài nguyên khung ảnh.
   - Triển khai độc lập trên nền tảng Cloud (Vercel / VPS / Docker).

---

## 🎨 CẤU TRÚC DESIGN SYSTEM

```
design-system/
├── tokens/
│   ├── colors.json       # Bảng mã màu chuẩn (Fotolism Warm Brown #4A2E18, Gold #D97706)
│   └── semantic.json     # Tokens ngữ nghĩa (primary, surface, border, success, error)
├── themes/
│   ├── light.css         # Theme sáng chủ đạo (ấm áp, sang trọng phong cách Hàn Quốc)
│   ├── dark.css          # Theme tối (dành cho chế độ chụp đêm/admin)
│   └── index.css         # Entrypoint nạp toàn bộ theme
└── components/
    ├── buttons.css       # Các nút bấm cảm ứng bo tròn, hỗ trợ Touch-First Kiosk
    ├── cards.css         # Khung thẻ hiển thị gói in, giá tiền, dải ảnh
    └── inputs.css        # Ô nhập mã voucher, bàn phím số cảm ứng
```

---

## 📐 NGUYÊN TẮC THIẾT KẾ (DESIGN PRINCIPLES)

1. **Touch-First for Kiosk:** Mọi thành phần trên Kiosk `desktop` có diện tích chạm tối thiểu $48 \times 48\text{px}$, hiệu ứng phản hồi xúc giác (Active feedback) dứt khoát trong 100ms.
2. **Responsive for CMS:** Mọi màn hình trên `fotolism` (Cloud CMS) tối ưu responsive 100% trên cả điện thoại (cho chủ chuỗi theo dõi doanh thu) và máy tính (cho kế toán đối soát).
3. **Cohesive Brand Identity:** Giữ trọn vẹn tone màu ấm sang trọng của thương hiệu Fotolism trên cả màn hình khách hàng và bảng điều khiển quản trị.

