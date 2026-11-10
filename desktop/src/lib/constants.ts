// ─── FOTOLISM SYSTEM & BRAND CONSTANTS ─────────────────────────────────────────
// Cấu hình tập trung toàn bộ thông số, thương hiệu, đường dẫn và giá trị mặc định.

// ── 1. Brand & Identity ──
/** Tên thương hiệu chính */
export const BRAND_NAME = 'fotolism'

/** Tên thương hiệu viết hoa */
export const BRAND_NAME_UPPER = 'fotolism'

/** Tên ứng dụng đầy đủ */
export const APP_NAME = 'fotolism photobooth'

/** Tên sự kiện mặc định */
export const DEFAULT_EVENT_NAME = 'fotolism photobooth'

/** Năm phát hành */
export const APP_YEAR = '2026'

/** Website domain */
export const APP_DOMAIN = 'fotolism.app'

// ── 2. Security & Admin ──
/** Mã PIN quản trị mặc định (Có thể thiết lập mã PIN riêng trong Cài Đặt) */
export const DEFAULT_ADMIN_PIN = '8888'

// ── 3. File System & Storage ──
/** Tên thư mục lưu ảnh */
export const SAVE_FOLDER_NAME = 'Fotolism_image'

/** Đường dẫn lưu ảnh tuyệt đối (Ưu tiên ổ F:\ - thư mục làm việc thực tế) */
export const SAVE_ROOT_DIR = 'F:\\Fotolism_image'

/** Đường dẫn dự phòng thứ hai (Ổ C:\) */
export const FALLBACK_SAVE_ROOT_DIR = 'C:\\Fotolism_image'

/** Tiền tố tên file ảnh chụp đơn */
export const FILE_PREFIX_SHOT = 'fotolism_shot'

/** Tiền tố tên file dải ảnh hoàn chỉnh */
export const FILE_PREFIX_FINAL = 'fotolism_final'

/** Tiền tố tên file timelapse */
export const FILE_PREFIX_TIMELAPSE = 'fotolism_timelapse'

/** Tiền tố tên file tự chụp (selfbooth) */
export const FILE_PREFIX_SELF = 'fotolism_self'

/** Tiền tố tên thư mục phiên chụp (session subfolder) */
export const SESSION_FOLDER_PREFIX = 'fotolism'

/** LocalStorage key cho beauty config */
export const LS_BEAUTY_CONFIG_KEY = 'fotolism_beauty_config'

/** LocalStorage key cho event & settings config */
export const LS_EVENT_CONFIG_KEY = 'fotolism_event_config'

// ── 4. VietQR & Banking Defaults ──
/** Mã BIN ngân hàng mặc định (970422 = MB Bank) */
export const DEFAULT_BANK_BIN = '970422'

/** Tên ngân hàng mặc định */
export const DEFAULT_BANK_NAME = 'MBBank (Ngân hàng Quân Đội)'

/** Số tài khoản mặc định */
export const DEFAULT_ACCOUNT_NUMBER = '03609032002'

/** Tên chủ tài khoản mặc định */
export const DEFAULT_ACCOUNT_HOLDER = 'NGUYEN HOANG'

/** Mã giảm giá mẫu mặc định */
export const DEFAULT_COUPON_CODE = 'fotolism10'

// ── 5. Pricing Defaults (VND) ──
/** Giá gói dải 2x6 inch (70.000 đ) */
export const DEFAULT_PRICE_2X6 = 70000

/** Giá gói postcard 4x6 inch (90.000 đ) */
export const DEFAULT_PRICE_4X6 = 90000

/** Giá in thêm 2x6 inch (+1 ảnh: 40.000 đ) */
export const DEFAULT_EXTRA_COPY_PRICE_2X6 = 40000

/** Giá in thêm 4x6 inch (+1 ảnh: 40.000 đ) */
export const DEFAULT_EXTRA_COPY_PRICE_4X6 = 40000

/** Giá gói Selfbooth 5 phút mặc định (VND) - 1 người */
export const DEFAULT_SELFBOOTH_PRICE_5M = 90000

/** Giá gói Selfbooth 7 phút mặc định (VND) - 2-3 người */
export const DEFAULT_SELFBOOTH_PRICE_7M = 130000

/** Giá gói Selfbooth 10 phút mặc định (VND) - 3-4 người */
export const DEFAULT_SELFBOOTH_PRICE_10M = 180000

// ── 6. Session & Timeouts ──
/** Thời gian chờ trở về màn hình chờ khi không có thao tác (giây) */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 120

/** Thời gian phiên chụp tự do Selfbooth mặc định (giây - 5 phút) */
export const DEFAULT_SELFBOOTH_DURATION_SECONDS = 300

/** Thời gian đếm ngược khi bấm Remote Selfbooth (giây) */
export const DEFAULT_SELFBOOTH_CAPTURE_COUNTDOWN = 2

/**
 * Danh sách các phím Remote / Clicker hợp lệ để bấm chụp trong Selfbooth
 * Hỗ trợ toàn diện remote Rapoo R100/XR100, clicker trình chiếu 2.4GHz, remote Bluetooth AB Shutter:
 * - Nút Tới / Next: 'PageDown', 'ArrowDown', 'ArrowRight'
 * - Nút Lùi / Prev: 'PageUp', 'ArrowUp', 'ArrowLeft'
 * - Nút Màn hình đen / Black Screen: 'b', 'B', 'KeyB', '.', 'Period'
 * - Nút Toàn màn hình / F5: 'F5', 'Escape', 'f', 'F', 'KeyF'
 * - Nút Chọn / Enter / Space: 'Enter', 'NumpadEnter', 'Space', ' '
 * - Nút Âm lượng (Remote Bluetooth chụp ảnh): 'AudioVolumeUp', 'AudioVolumeDown', 'VolumeUp', 'VolumeDown', 'MediaPlayPause'
 */
export const REMOTE_TRIGGER_KEYS: readonly string[] = [
  // Space & Enter
  ' ',
  'Space',
  'Enter',
  'NumpadEnter',
  // Rapoo R100 Next / Down
  'PageDown',
  'ArrowDown',
  'ArrowRight',
  // Rapoo R100 Prev / Up
  'PageUp',
  'ArrowUp',
  'ArrowLeft',
  // Rapoo R100 Black Screen button
  'b',
  'B',
  'KeyB',
  '.',
  'Period',
  // Rapoo R100 Fullscreen / Exit
  'F5',
  'Escape',
  'f',
  'F',
  'KeyF',
  // Bluetooth remote / Shutter buttons
  'AudioVolumeUp',
  'AudioVolumeDown',
  'VolumeUp',
  'VolumeDown',
  'MediaPlayPause',
  'MediaTrackNext',
  'MediaTrackPrevious',
]

/**
 * Legacy keyCode map cho thiết bị remote/bluetooth gửi keyCode thay vì key/code chuẩn.
 * Rapoo XR100, một số remote Bluetooth không dây thường dùng keyCode số nguyên.
 */
export const REMOTE_TRIGGER_KEYCODES: readonly number[] = [
  13,  // Enter
  32,  // Space
  33,  // PageUp  (nút Prev / Lùi)
  34,  // PageDown (nút Next / Tiến)
  37,  // ArrowLeft
  38,  // ArrowUp
  39,  // ArrowRight
  40,  // ArrowDown
  66,  // B (black screen)
  70,  // F (fullscreen)
  116, // F5
  27,  // Escape
]

/** Kiểm tra KeyboardEvent có phải là phím kích hoạt remote chụp ảnh hay không */
export function isRemoteTriggerEvent(e: KeyboardEvent): boolean {
  // Kiểm tra key/code chuẩn trước
  if (REMOTE_TRIGGER_KEYS.includes(e.key) || REMOTE_TRIGGER_KEYS.includes(e.code)) {
    return true
  }
  // Fallback: thiết bị remote gửi keyCode số (Unidentified / undefined key)
  if (e.key === 'Unidentified' || !e.key || e.key === 'undefined') {
    return REMOTE_TRIGGER_KEYCODES.includes(e.keyCode)
  }
  // Fallback thêm: so sánh keyCode trực tiếp cho mọi trường hợp
  return REMOTE_TRIGGER_KEYCODES.includes(e.keyCode)
}

export interface SelfboothPackage {
  id: '5m' | '7m' | '10m'
  name: string
  minutes: number
  durationSeconds: number
  defaultPrice: number
  badge: string
  description: string
}

export const SELFBOOTH_PACKAGES: SelfboothPackage[] = [
  {
    id: '5m',
    name: 'Selfbooth 5p',
    minutes: 5,
    durationSeconds: 300,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_5M,
    badge: '1 NGƯỜI',
    description: 'Dành cho 1 người (5 phút)',
  },
  {
    id: '7m',
    name: 'Selfbooth 7p',
    minutes: 7,
    durationSeconds: 420,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_7M,
    badge: '2-3 NGƯỜI',
    description: 'Dành cho 2-3 người (7 phút)',
  },
  {
    id: '10m',
    name: 'Selfbooth 10p',
    minutes: 10,
    durationSeconds: 600,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_10M,
    badge: '3-4 NGƯỜI',
    description: 'Dành cho 3-4 người (10 phút)',
  },
]

/** Tốc độ tua video timelapse hậu trường (VD: 2.5x) */
export const DEFAULT_TIMELAPSE_SPEED = 2.5

// ── 7. Cloud Storage (Google Drive) ──
/** Mã thư mục Google Drive mặc định */
export const DEFAULT_GDRIVE_FOLDER_ID = '1FcgyAe79bpnZnYgxR4i4b4qM_42oB5eU'

/** Đường dẫn thư mục Google Drive mặc định */
export const DEFAULT_GDRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1FcgyAe79bpnZnYgxR4i4b4qM_42oB5eU'

/** Webhook Google Apps Script mặc định để tự động tạo subfolder */
export const DEFAULT_GDRIVE_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbw2koNyt_6qjUzZn9waLYL4eDv_YbRrp7PuZoPHgJoFZVETOKEnMdo_nbfyHm9BzvI1/exec'

// ── 8. Hardware & Camera Specifications ──
/** USB Vendor ID của Canon EOS */
export const CANON_USB_VENDOR_ID = 'VID_04A9'

/** Thời gian timeout khi chụp màn trập máy ảnh thật (ms) */
export const CAMERA_SHUTTER_TIMEOUT_MS = 15000

/** Thời gian timeout khi gửi lệnh in (ms) */
export const PRINT_JOB_TIMEOUT_MS = 10000

// ── 9. Asset & Resource Resolution ──
/**
 * Chuẩn hóa đường dẫn tài nguyên tĩnh (frames, overlays, icons)
 * Đảm bảo tương thích 100% trên cả Electron (file:// protocol) lẫn Vite Dev Server (http://127.0.0.1:5173).
 * Biến đổi các đường dẫn tuyệt đối /frames/... thành relative ./frames/...
 */
export function resolveAssetUrl(url?: string): string {
  if (!url) return ''
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('file://')
  ) {
    return url
  }
  if (url.startsWith('./')) {
    return url
  }
  const clean = url.startsWith('/') ? url.slice(1) : url
  return `./${clean}`
}
