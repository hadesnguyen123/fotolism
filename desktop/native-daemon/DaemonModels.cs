using System;
using System.Text;
using System.Threading;

namespace FotolismCanonDaemon {
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

    public class StructuredLog {
        public string Timestamp;
        public string Level;
        public string Event;
        public string CameraState;
        public string SessionId;
        public string CaptureId;
        public long DurationMs;
        public string Details;

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

