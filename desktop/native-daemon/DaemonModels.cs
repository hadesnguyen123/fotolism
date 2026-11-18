// <summary>
// Quản lý các cấu trúc dữ liệu, enum trạng thái máy ảnh Canon và bản ghi tác vụ chụp ảnh
// cho tiến trình Canon EDSDK Persistent Daemon (cổng 8899).
// Không có phụ thuộc bên thứ ba ngoài runtime .NET BCL.
// </summary>

using System;
using System.Text;
using System.Threading;

namespace FotolismCanonDaemon {
    /// <summary>
    /// Các trạng thái vòng đời kết nối và vận hành của máy ảnh Canon qua EDSDK.
    /// Giúp máy trạng thái (state machine) ngăn ngừa việc gửi lệnh chồng chéo khi máy ảnh đang bận.
    /// </summary>
    public enum CameraState {
        DISCONNECTED,
        CONNECTING,
        READY,
        LIVEVIEW,
        CAPTURING,
        TRANSFERRING,
        RECOVERING,
        ERROR
    }

    /// <summary>
    /// Tiến độ xử lý của một yêu cầu chụp ảnh đơn lẻ trong hàng đợi tuần tự.
    /// </summary>
    public enum CaptureStatus {
        PENDING,
        CAPTURING,
        TRANSFERRING,
        COMPLETED,
        FAILED,
        TIMED_OUT,
        RECOVERING,
        UNKNOWN
    }

    /// <summary>
    /// Bản ghi ngữ cảnh và kết quả của một tác vụ chụp ảnh, hỗ trợ Idempotency và đo lường độ trễ phần cứng.
    /// </summary>
    public class CaptureRecord {
        public string CaptureId;
        public string SessionId;
        public int SlotIndex;
        public CaptureStatus Status;
        public string FinalPath;
        public long SizeBytes;
        public long ShutterLatencyMs;
        public long TransferLatencyMs;
        public long TotalLatencyMs;
        public string ErrorMessage;
        public DateTime CreatedAt = DateTime.Now;
        public DateTime? CompletedAt;
        public ManualResetEvent DoneEvent = new ManualResetEvent(false);
    }

    /// <summary>
    /// Định dạng bản ghi nhật ký cấu trúc (JSON Log) để chuẩn hóa log xuất ra console và file theo dõi.
    /// </summary>
    public class StructuredLog {
        public string Timestamp;
        public string Level;
        public string Event;
        public string CameraState;
        public string SessionId;
        public string CaptureId;
        public long DurationMs;
        public string Details;

        /// <summary>
        /// Chuyển đổi đối tượng log sang chuỗi JSON rút gọn, tự escape ký tự đặc biệt mà không cần thư viện JSON ngoài.
        /// </summary>
        public string ToJson() {
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            sb.AppendFormat("\"timestamp\":\"{0}\",", Timestamp);
            sb.AppendFormat("\"level\":\"{0}\",", Level);
            sb.AppendFormat("\"event\":\"{0}\",", Event);
            sb.AppendFormat("\"cameraState\":\"{0}\"", CameraState);
            if (!string.IsNullOrEmpty(SessionId)) sb.AppendFormat(",\"sessionId\":\"{0}\"", SessionId);
            if (!string.IsNullOrEmpty(CaptureId)) sb.AppendFormat(",\"captureId\":\"{0}\"", CaptureId);
            if (DurationMs > 0) sb.AppendFormat(",\"durationMs\":{0}", DurationMs);
            if (!string.IsNullOrEmpty(Details)) sb.AppendFormat(",\"details\":\"{0}\"", Details.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " "));
            sb.Append("}");
            return sb.ToString();
        }
    }
}


