---
name: print-manager
description: Hướng dẫn quản lý máy in nhiệt dye-sub (DNP RX1HS, HiTi P525L, Canon Selphy), cấu hình khổ giấy Windows, hàng đợi in Spooler và đếm định mức giấy in Fotolism 3.0.
---

# Print Manager Skill — Fotolism 3.0

Tuân thủ `AGENTS.md` và `.agents/rules/hardware-safety.md` (chế độ 2-inch cut chẵn `+2` cho dải `2x6`, kiểm tra Spooler trước khi trừ lượt in).

## 1. Thiết bị & Khổ in chuẩn

| Máy in | Khổ in | Cơ chế cắt | Định mức cuộn | Tốc độ |
| :--- | :--- | :--- | :--- | :--- |
| **DNP DS-RX1HS** | `4x6` (`1200x1800 px`), `2x6` strip | Bật **2-inch Cut** trong Windows Driver | 700 tờ `4x6` (1400 dải `2x6`) | ~12.4s/bản |
| **DNP DS620A** | `4x6`, `2x6`, `6x8` | Tự động cắt đa khổ | — | ~8.4s/bản |
| **HiTi P525L** | `4x6`, `2x6` strip | Dao cắt `2x6` cơ học | 500 tờ `4x6` | ~12.8s/bản |
| **Canon Selphy CP1300/1500** | `4x6` postcard | Cắt thủ công viền răng cưa | — | ~47s/bản |

## 2. Luồng điều khiển & Electron IPC

Luồng: `ReviewScreen / AdminScreen` → IPC (`desktop/electron/ipc/printerIpc.cts`) → Windows Print Spooler → ghi `PrintJobs` vào SQLite (`sessionDatabase.cts`).

- **`printer:get-status`**: Trả về `{ success: true, data: { printers: [...], defaultPrinter: string, isOnline: bool } }`.
- **`printer:print-photo`**: Nhận `{ filePath: string, copies: number, paperSize: '2x6' | '4x6' }`, ghi `PrintJob` vào SQLite, trả về `{ success: true, data: { jobId: string, printedCopies: number } }`.

## 3. Kiểm tra & xử lý Spooler (PowerShell)

```powershell
# Danh sách máy in và trạng thái
Get-Printer | Select-Object Name, PrinterStatus, PortName, DriverName

# Hàng đợi in đang xử lý
Get-PrintJob -PrinterName "DNP DS-RX1HS" | Select-Object Id, DocumentName, JobStatus, TotalPages

# Hủy lệnh in bị kẹt
Get-PrintJob -PrinterName "DNP DS-RX1HS" | Remove-PrintJob
```

## 4. Định mức giấy & đối soát

- Trừ trực tiếp `paper_remaining` sau mỗi lệnh in thành công; dưới **50 tờ** bật cảnh báo `WARN_PAPER_LOW` trên Admin & CMS; về **0** khóa in giấy, chỉ cho nhận ảnh qua QR.
- `PrintJobs` trong SQLite là nguồn đối soát 3 bên (VietQR + Tiền mặt + Giấy in tiêu hao).
