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

/** Giá in thêm 2x6 inch (+1 ảnh: 30.000 đ) */
export const DEFAULT_EXTRA_COPY_PRICE_2X6 = 30000

/** Giá in thêm 4x6 inch (+1 ảnh: 30.000 đ) */
export const DEFAULT_EXTRA_COPY_PRICE_4X6 = 30000

/** Giá gói Selfbooth 5 phút mặc định (VND) */
export const DEFAULT_SELFBOOTH_PRICE_5M = 50000

/** Giá gói Selfbooth 7 phút mặc định (VND) */
export const DEFAULT_SELFBOOTH_PRICE_7M = 70000

/** Giá gói Selfbooth 10 phút mặc định (VND) */
export const DEFAULT_SELFBOOTH_PRICE_10M = 100000

// ── 6. Session & Timeouts ──
/** Thời gian chờ trở về màn hình chờ khi không có thao tác (giây) */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 60

/** Thời gian phiên chụp tự do Selfbooth mặc định (giây - 5 phút) */
export const DEFAULT_SELFBOOTH_DURATION_SECONDS = 300

/** Thời gian đếm ngược khi bấm Remote Selfbooth (giây) */
export const DEFAULT_SELFBOOTH_CAPTURE_COUNTDOWN = 2

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
    name: 'Gói 5 Phút',
    minutes: 5,
    durationSeconds: 300,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_5M,
    badge: 'TIÊU CHUẨN',
    description: 'Chụp tự do không giới hạn số ảnh trong 5 phút',
  },
  {
    id: '7m',
    name: 'Gói 7 Phút',
    minutes: 7,
    durationSeconds: 420,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_7M,
    badge: 'PHỔ BIẾN NHẤT',
    description: 'Thời gian chụp lý tưởng, thoải mái tạo dáng cùng bạn bè',
  },
  {
    id: '10m',
    name: 'Gói 10 Phút',
    minutes: 10,
    durationSeconds: 600,
    defaultPrice: DEFAULT_SELFBOOTH_PRICE_10M,
    badge: 'VIP KHUYẾN NGHỊ',
    description: 'Trọn vẹn mọi khoảnh khắc, nhận toàn bộ ảnh gốc chất lượng cao',
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
