using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace FotolismCanonDaemon {
    class Program {
        // Canon EDSDK Constants & Function Aliases mapped to EdsdkNative
        public const uint kEdsPropID_SaveTo = EdsdkNative.kEdsPropID_SaveTo;
        public const uint kEdsSaveTo_Host = EdsdkNative.kEdsSaveTo_Host;
        public const uint kEdsSaveTo_Both = EdsdkNative.kEdsSaveTo_Both;
        public const uint kEdsPropID_Evf_OutputDevice = EdsdkNative.kEdsPropID_Evf_OutputDevice;
        public const uint kEdsEvfOutputDevice_PC = EdsdkNative.kEdsEvfOutputDevice_PC;

        public const uint kEdsPropID_AEModeSelect = EdsdkNative.kEdsPropID_AEModeSelect;
        public const uint kEdsPropID_Tv = EdsdkNative.kEdsPropID_Tv;
        public const uint kEdsPropID_Av = EdsdkNative.kEdsPropID_Av;
        public const uint kEdsPropID_ISOSpeed = EdsdkNative.kEdsPropID_ISOSpeed;
        public const uint kEdsPropID_BatteryLevel = EdsdkNative.kEdsPropID_BatteryLevel;

        public const uint kEdsCameraCommand_TakePicture = EdsdkNative.kEdsCameraCommand_TakePicture;
        public const uint kEdsCameraCommand_ExtendShutDownTimer = EdsdkNative.kEdsCameraCommand_ExtendShutDownTimer;
        public const uint kEdsCameraCommand_PressShutterButton = EdsdkNative.kEdsCameraCommand_PressShutterButton;
        public const int kEdsCameraCommand_ShutterButton_OFF = EdsdkNative.kEdsCameraCommand_ShutterButton_OFF;
        public const int kEdsCameraCommand_ShutterButton_Halfway = EdsdkNative.kEdsCameraCommand_ShutterButton_Halfway;
        public const int kEdsCameraCommand_ShutterButton_Completely = EdsdkNative.kEdsCameraCommand_ShutterButton_Completely;
        public const int kEdsCameraCommand_ShutterButton_Completely_NonAF = EdsdkNative.kEdsCameraCommand_ShutterButton_Completely_NonAF;

        public const uint kEdsObjectEvent_All = EdsdkNative.kEdsObjectEvent_All;
        public const uint kEdsObjectEvent_DirItemRequestTransfer = EdsdkNative.kEdsObjectEvent_DirItemRequestTransfer;
        public const uint kEdsObjectEvent_DirItemCreated = EdsdkNative.kEdsObjectEvent_DirItemCreated;
        public const uint kEdsObjectEvent_DirItemRequestTransferDT = EdsdkNative.kEdsObjectEvent_DirItemRequestTransferDT;

        public const uint kEdsStateEvent_All = EdsdkNative.kEdsStateEvent_All;
        public const uint kEdsStateEvent_Shutdown = EdsdkNative.kEdsStateEvent_Shutdown;
        public const uint kEdsStateEvent_JobStatusChanged = EdsdkNative.kEdsStateEvent_JobStatusChanged;
        public const uint kEdsStateEvent_WillSoonShutDown = EdsdkNative.kEdsStateEvent_WillSoonShutDown;
        public const uint kEdsStateEvent_ShutDownTimerUpdate = EdsdkNative.kEdsStateEvent_ShutDownTimerUpdate;
        public const uint kEdsStateEvent_CaptureError = EdsdkNative.kEdsStateEvent_CaptureError;
        public const uint kEdsStateEvent_InternalError = EdsdkNative.kEdsStateEvent_InternalError;
        public const uint kEdsStateEvent_AfResult = EdsdkNative.kEdsStateEvent_AfResult;

        public static uint EdsInitializeSDK() { return EdsdkNative.EdsInitializeSDK(); }
        public static uint EdsTerminateSDK() { return EdsdkNative.EdsTerminateSDK(); }
        public static uint EdsGetCameraList(out IntPtr list) { return EdsdkNative.EdsGetCameraList(out list); }
        public static uint EdsGetChildCount(IntPtr inRef, out int count) { return EdsdkNative.EdsGetChildCount(inRef, out count); }
        public static uint EdsGetChildAtIndex(IntPtr inRef, int index, out IntPtr outRef) { return EdsdkNative.EdsGetChildAtIndex(inRef, index, out outRef); }
        public static uint EdsOpenSession(IntPtr cam) { return EdsdkNative.EdsOpenSession(cam); }
        public static uint EdsCloseSession(IntPtr cam) { return EdsdkNative.EdsCloseSession(cam); }
        public static uint EdsSendCommand(IntPtr camera, uint command, int param) { return EdsdkNative.EdsSendCommand(camera, command, param); }
        public static uint EdsSetPropertyData(IntPtr cam, uint propId, int param, int size, ref uint data) { return EdsdkNative.EdsSetPropertyData(cam, propId, param, size, ref data); }
        public static uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, out uint outPropertyData) { return EdsdkNative.EdsGetPropertyData(inRef, inPropertyID, inParam, inPropertySize, out outPropertyData); }
        public static uint EdsSetCapacity(IntPtr camera, EdsCapacity capacity) { return EdsdkNative.EdsSetCapacity(camera, capacity); }
        public static uint EdsSetObjectEventHandler(IntPtr camera, uint inEvent, EdsObjectEventHandler inEventHandler, IntPtr inContext) { return EdsdkNative.EdsSetObjectEventHandler(camera, inEvent, inEventHandler, inContext); }
        public static uint EdsSetCameraStateEventHandler(IntPtr camera, uint inEvent, EdsCameraStateEventHandler inEventHandler, IntPtr inContext) { return EdsdkNative.EdsSetCameraStateEventHandler(camera, inEvent, inEventHandler, inContext); }
        public static uint EdsGetDirectoryItemInfo(IntPtr dirItem, out EdsDirectoryItemInfo outInfo) { return EdsdkNative.EdsGetDirectoryItemInfo(dirItem, out outInfo); }
        public static uint EdsCreateFileStream(string inFileName, uint inCreateDisposition, uint inDesiredAccess, out IntPtr outStream) { return EdsdkNative.EdsCreateFileStream(inFileName, inCreateDisposition, inDesiredAccess, out outStream); }
        public static uint EdsDownload(IntPtr dirItem, ulong inReadSize, IntPtr outStream) { return EdsdkNative.EdsDownload(dirItem, inReadSize, outStream); }
        public static uint EdsDownloadComplete(IntPtr dirItem) { return EdsdkNative.EdsDownloadComplete(dirItem); }
        public static uint EdsCreateMemoryStream(ulong inSize, out IntPtr outStream) { return EdsdkNative.EdsCreateMemoryStream(inSize, out outStream); }
        public static uint EdsCreateEvfImageRef(IntPtr inStream, out IntPtr outEvfImage) { return EdsdkNative.EdsCreateEvfImageRef(inStream, out outEvfImage); }
        public static uint EdsDownloadEvfImage(IntPtr cam, IntPtr evfImage) { return EdsdkNative.EdsDownloadEvfImage(cam, evfImage); }
        public static uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer) { return EdsdkNative.EdsGetPointer(inStream, out outPointer); }
        public static uint EdsGetLength(IntPtr inStream, out ulong outLength) { return EdsdkNative.EdsGetLength(inStream, out outLength); }
        public static uint EdsGetEvent() { return EdsdkNative.EdsGetEvent(); }
        public static uint EdsRelease(IntPtr inRef) { return EdsdkNative.EdsRelease(inRef); }

        // State Machine & Hardware State
        private static volatile CameraState _currentState = CameraState.DISCONNECTED;
        private static readonly object StateLock = new object();
        public static CameraState CurrentState {
            get { return _currentState; }
            private set {
                lock (StateLock) {
                    if (_currentState != value) {
                        CameraState prev = _currentState;
                        _currentState = value;
                        Log("INFO", "STATE_CHANGE", string.Format("Transitioned from {0} to {1}", prev, value));
                    }
                }
            }
        }

        private static IntPtr CameraRef = IntPtr.Zero;
        private static EdsObjectEventHandler HandlerRef;
        private static EdsCameraStateEventHandler StateHandlerRef;
        private static volatile bool ShouldExit = false;

        // Command Queue (Thread-Safe Single Consumer on Main STA Thread)
        private static readonly ConcurrentQueue<CaptureRecord> CommandQueue = new ConcurrentQueue<CaptureRecord>();
        private static readonly ConcurrentDictionary<string, CaptureRecord> IdempotencyMap = new ConcurrentDictionary<string, CaptureRecord>();

        // Transfer & Shutter context
        private static CaptureRecord ActiveCapture = null;
        private static readonly object ActiveCaptureLock = new object();
        private static string ActiveTmpPath = "";
        private static Stopwatch TransferStopwatch = new Stopwatch();

        // Live View Stream Buffer & Metrics
        private static byte[] LatestEvfFrame = null;
        private static readonly object FrameLock = new object();
        private static int ActiveLiveViewClients = 0;
        private static double MeasuredEvfFps = 0;
        private static long MeasuredEvfLatencyMs = 0;
        private static int EvfFrameCountInSec = 0;
        private static DateTime LastFpsCalculation = DateTime.Now;

        // Observability & Diagnostics
        private static long TotalCapturesCount = 0;
        private static long FailedCapturesCount = 0;
        private static long TotalCaptureLatencyMs = 0;
        private static int ReconnectCount = 0;
        private static readonly List<StructuredLog> RecentLogs = new List<StructuredLog>();
        private static readonly object LogsLock = new object();

        public static void Log(string level, string eventName, string details, string sessionId = null, string captureId = null, long durationMs = 0) {
            StructuredLog entry = new StructuredLog {
                Timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz"),
                Level = level,
                Event = eventName,
                CameraState = CurrentState.ToString(),
                SessionId = sessionId,
                CaptureId = captureId,
                DurationMs = durationMs,
                Details = details
            };

            lock (LogsLock) {
                RecentLogs.Add(entry);
                if (RecentLogs.Count > 60) RecentLogs.RemoveAt(0);
            }

            Console.WriteLine(entry.ToJson());
        }

        // EDSDK Object Event Callback for Shutter & Transfer
        public static uint HandleObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext) {
            Log("DEBUG", "EDSDK_EVENT", string.Format("Event code 0x{0:X8}", inEvent));
            if (inEvent == kEdsObjectEvent_DirItemRequestTransfer || inEvent == kEdsObjectEvent_DirItemCreated || inEvent == kEdsObjectEvent_DirItemRequestTransferDT) {
                CaptureRecord job;
                lock (ActiveCaptureLock) {
                    job = ActiveCapture;
                }

                if (job == null) {
                    Log("WARN", "UNSOLICITED_TRANSFER", "Transfer event received but no active capture job");
                    if (inRef != IntPtr.Zero) EdsRelease(inRef);
                    return 0;
                }

                if (job.Status == CaptureStatus.COMPLETED) {
                    if (inRef != IntPtr.Zero) EdsRelease(inRef);
                    return 0;
                }

                CurrentState = CameraState.TRANSFERRING;
                job.Status = CaptureStatus.TRANSFERRING;
                TransferStopwatch.Restart();

                EdsDirectoryItemInfo info;
                uint err = EdsGetDirectoryItemInfo(inRef, out info);
                Log("INFO", "TRANSFER_START", string.Format("Transferring item {0}, expected size {1} bytes", info.szFileName, info.size), job.SessionId, job.CaptureId);

                bool downloadOk = false;
                long bytesWritten = 0;

                if (err == 0 && !string.IsNullOrEmpty(ActiveTmpPath)) {
                    string tmpDir = Path.GetDirectoryName(ActiveTmpPath);
                    if (!string.IsNullOrEmpty(tmpDir) && !Directory.Exists(tmpDir)) {
                        Directory.CreateDirectory(tmpDir);
                    }

                    // 1. Download directly to .tmp file stream
                    IntPtr fileStream;
                    uint stErr = EdsCreateFileStream(ActiveTmpPath, 1, 2, out fileStream);
                    if (stErr == 0) {
                        uint dlErr = EdsDownload(inRef, info.size, fileStream);
                        EdsDownloadComplete(inRef);
                        EdsRelease(fileStream);

                        if (dlErr == 0 && File.Exists(ActiveTmpPath) && new FileInfo(ActiveTmpPath).Length > 1000) {
                            bytesWritten = new FileInfo(ActiveTmpPath).Length;
                            downloadOk = VerifyJpegFile(ActiveTmpPath);
                        }
                    } else {
                        // 2. MemoryStream fallback if FileStream disposition fails
                        IntPtr memStream;
                        uint memErr = EdsCreateMemoryStream(info.size, out memStream);
                        if (memErr == 0) {
                            uint dlErr = EdsDownload(inRef, info.size, memStream);
                            EdsDownloadComplete(inRef);
                            if (dlErr == 0) {
                                IntPtr ptr;
                                EdsGetPointer(memStream, out ptr);
                                if (ptr != IntPtr.Zero) {
                                    byte[] bytes = new byte[info.size];
                                    Marshal.Copy(ptr, bytes, 0, (int)info.size);
                                    File.WriteAllBytes(ActiveTmpPath, bytes);
                                    bytesWritten = bytes.Length;
                                    downloadOk = VerifyJpegFile(ActiveTmpPath);
                                }
                            }
                            EdsRelease(memStream);
                        }
                    }
                }

                TransferStopwatch.Stop();
                job.TransferLatencyMs = TransferStopwatch.ElapsedMilliseconds;

                if (downloadOk) {
                    try {
                        // Atomic Rename from .tmp to final destination path
                        string finalDir = Path.GetDirectoryName(job.FinalPath);
                        if (!string.IsNullOrEmpty(finalDir) && !Directory.Exists(finalDir)) {
                            Directory.CreateDirectory(finalDir);
                        }
                        if (File.Exists(job.FinalPath)) {
                            File.Delete(job.FinalPath);
                        }
                        File.Move(ActiveTmpPath, job.FinalPath);

                        job.Status = CaptureStatus.COMPLETED;
                        job.SizeBytes = bytesWritten;
                        job.CompletedAt = DateTime.Now;
                        Log("INFO", "CAPTURE_SAVED", string.Format("Atomic rename to {0} succeeded ({1} bytes)", job.FinalPath, bytesWritten), job.SessionId, job.CaptureId, job.TransferLatencyMs);
                    } catch (Exception ex) {
                        job.Status = CaptureStatus.FAILED;
                        job.ErrorMessage = "Atomic move error: " + ex.Message;
                        Log("ERROR", "ATOMIC_MOVE_FAILED", ex.Message, job.SessionId, job.CaptureId);
                    }
                } else {
                    job.Status = CaptureStatus.FAILED;
                    job.ErrorMessage = "Corrupted or incomplete image download";
                    try { if (File.Exists(ActiveTmpPath)) File.Delete(ActiveTmpPath); } catch {}
                    Log("ERROR", "DOWNLOAD_CORRUPTED", "Downloaded file failed JPEG validation or size check", job.SessionId, job.CaptureId);
                }

                if (inRef != IntPtr.Zero) EdsRelease(inRef);
            } else if (inRef != IntPtr.Zero) {
                EdsRelease(inRef);
            }
            return 0;
        }

        private static bool VerifyJpegFile(string filePath) {
            try {
                if (!File.Exists(filePath)) return false;
                FileInfo fi = new FileInfo(filePath);
                if (fi.Length < 1000) return false;

                // Validate JPEG Magic SOI bytes: 0xFF, 0xD8
                using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    if (fs.Length < 4) return false;
                    int b1 = fs.ReadByte();
                    int b2 = fs.ReadByte();
                    return (b1 == 0xFF && b2 == 0xD8);
                }
            } catch {
                return false;
            }
        }

        static uint HandleStateEvent(uint inEvent, uint inParameter, IntPtr inContext) {
            if (inEvent == kEdsStateEvent_WillSoonShutDown) {
                Log("WARN", "CAMERA_WILL_SHUTDOWN", string.Format("Camera sleep warning: auto power-off in {0}s! Extending shutdown timer...", inParameter));
                if (CameraRef != IntPtr.Zero) {
                    uint extErr = EdsSendCommand(CameraRef, kEdsCameraCommand_ExtendShutDownTimer, 0);
                    Log("INFO", "EXTEND_TIMER_RESULT", "ExtendShutDownTimer returned 0x" + extErr.ToString("X8"));
                }
            } else if (inEvent == kEdsStateEvent_Shutdown) {
                Log("WARN", "CAMERA_SHUTDOWN_EVENT", "Camera shutdown/sleep event received. Resetting session.");
                TriggerCameraReset("Camera shutdown event");
            } else if (inEvent == kEdsStateEvent_CaptureError) {
                Log("ERROR", "CAPTURE_ERROR_EVENT", string.Format("Camera capture error event: 0x{0:X8}", inParameter));
            }
            return 0;
        }

        static void TriggerCameraReset(string reason) {
            Log("WARN", "CAMERA_RESET", "Triggering session reset: " + reason);
            CurrentState = CameraState.RECOVERING;
            if (CameraRef != IntPtr.Zero) {
                try { EdsCloseSession(CameraRef); } catch {}
                try { EdsRelease(CameraRef); } catch {}
                CameraRef = IntPtr.Zero;
            }
        }

        static void Main(string[] args) {
            Console.WriteLine("=== FOTOLISM 2.2 CANON EDSDK PERSISTENT DAEMON ===");
            Log("INFO", "DAEMON_START", "Initializing Canon EDSDK subsystem...");
            EdsInitializeSDK();

            HttpListener listener = new HttpListener();
            listener.Prefixes.Add("http://127.0.0.1:8899/");
            listener.Start();
            Log("INFO", "HTTP_BOUND", "Fotolism Daemon listening strictly on http://127.0.0.1:8899/");

            Thread httpThread = new Thread(() => {
                while (listener.IsListening && !ShouldExit) {
                    try {
                        var ctx = listener.GetContext();
                        ThreadPool.QueueUserWorkItem((state) => HandleRequest(ctx));
                    } catch { break; }
                }
            });
            httpThread.IsBackground = true;
            httpThread.Start();

            DateTime lastKeepAlive = DateTime.Now;
            int backoffMs = 200;

            // MAIN STA/PTP WORKER LOOP
            while (!ShouldExit) {
                EnsureCameraConnected(ref backoffMs);

                // Anti-sleep keepalive: every 15s send ExtendShutDownTimer
                if (CurrentState != CameraState.DISCONNECTED && CameraRef != IntPtr.Zero && (DateTime.Now - lastKeepAlive).TotalSeconds > 15) {
                    uint extErr = EdsSendCommand(CameraRef, kEdsCameraCommand_ExtendShutDownTimer, 0);
                    if (extErr == 0x00000061 || extErr == 0x00002003) {
                        Log("WARN", "KEEPALIVE_INVALID_HANDLE", "ExtendShutDownTimer returned invalid handle (0x" + extErr.ToString("X8") + "). Triggering reconnect.");
                        TriggerCameraReset("KeepAlive invalid handle");
                    }
                    lastKeepAlive = DateTime.Now;
                }

                // Check Command Queue for Shutter Trigger
                CaptureRecord job = null;
                if (CommandQueue.TryDequeue(out job)) {
                    ExecuteShutter(job);
                } else {
                    if (CurrentState == CameraState.READY || CurrentState == CameraState.LIVEVIEW) {
                        CurrentState = CameraState.LIVEVIEW;
                        PullEvfFrame();
                    }
                    EdsGetEvent();
                    Thread.Sleep(30); // ~33 FPS EVF loop
                }
            }

            if (CameraRef != IntPtr.Zero) {
                try { EdsCloseSession(CameraRef); } catch {}
                try { EdsRelease(CameraRef); } catch {}
                CameraRef = IntPtr.Zero;
            }
            EdsTerminateSDK();
            Log("INFO", "DAEMON_STOP", "Daemon terminated cleanly.");
        }

        static void ExecuteShutter(CaptureRecord job) {
            if (CurrentState == CameraState.DISCONNECTED || CameraRef == IntPtr.Zero) {
                job.Status = CaptureStatus.FAILED;
                job.ErrorMessage = "Camera is disconnected. Shutter rejected.";
                job.DoneEvent.Set();
                Log("WARN", "CAPTURE_REJECTED", "Camera disconnected", job.SessionId, job.CaptureId);
                return;
            }

            Stopwatch totalSw = Stopwatch.StartNew();
            Stopwatch shutterSw = Stopwatch.StartNew();

            CurrentState = CameraState.CAPTURING;
            job.Status = CaptureStatus.CAPTURING;

            lock (ActiveCaptureLock) {
                ActiveCapture = job;
                ActiveTmpPath = job.FinalPath + ".tmp." + Guid.NewGuid().ToString("N").Substring(0, 8);
            }

            Log("INFO", "SHUTTER_TRIGGER", "Sending Completely_NonAF Shutter Command...", job.SessionId, job.CaptureId);

            // Shutter Trigger: Completely_NonAF (Zero AF lag)
            uint errShoot = EdsSendCommand(CameraRef, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
            Log("INFO", "SHUTTER_RESULT", "Shutter command returned: 0x" + errShoot.ToString("X8"), job.SessionId, job.CaptureId);

            if (errShoot == 0x00000061 || errShoot == 0x00002003) {
                Log("ERROR", "SHUTTER_INVALID_HANDLE", "Shutter command failed with invalid handle. Triggering reconnect.", job.SessionId, job.CaptureId);
                TriggerCameraReset("Shutter invalid handle 0x" + errShoot.ToString("X8"));
                job.Status = CaptureStatus.FAILED;
                job.ErrorMessage = "Camera session disconnected (0x" + errShoot.ToString("X8") + ")";
                FailedCapturesCount++;
                lock (ActiveCaptureLock) {
                    ActiveCapture = null;
                    ActiveTmpPath = "";
                }
                job.DoneEvent.Set();
                return;
            }

            if (errShoot == 0x00008D01) {
                Log("WARN", "AUTOFOCUS_FAILED", "Camera could not lock Auto Focus (0x8D01). Releasing shutter.", job.SessionId, job.CaptureId);
                EdsSendCommand(CameraRef, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
                job.Status = CaptureStatus.FAILED;
                job.ErrorMessage = "Auto Focus Failed (0x8D01). Vui lòng chuyển ống kính sang Manual Focus (MF) hoặc cải thiện ánh sáng.";
                FailedCapturesCount++;
                lock (ActiveCaptureLock) {
                    ActiveCapture = null;
                    ActiveTmpPath = "";
                }
                job.DoneEvent.Set();
                return;
            }

            // If camera was busy pulling EVF frame (0x00000081 DeviceBusy), release and retry ONCE after 60ms
            if (errShoot == 0x00000081) {
                Log("WARN", "CAMERA_BUSY", "Camera returned 0x81 (DeviceBusy). Pausing 60ms and retrying once...", job.SessionId, job.CaptureId);
                Thread.Sleep(60);
                EdsSendCommand(CameraRef, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
                Thread.Sleep(30);
                errShoot = EdsSendCommand(CameraRef, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
                Log("INFO", "SHUTTER_RETRY_RESULT", "Shutter retry returned: 0x" + errShoot.ToString("X8"), job.SessionId, job.CaptureId);
            }

            shutterSw.Stop();
            job.ShutterLatencyMs = shutterSw.ElapsedMilliseconds;

            // Wait for transfer event callback with timeout
            // Typical EOS R100 exposure + USB transfer is ~1.0 - 1.4 seconds.
            // Timeout limit: 6.0 seconds.
            int pollSteps = 120; // 120 * 50ms = 6000ms
            for (int i = 0; i < pollSteps; i++) {
                EdsGetEvent();
                if (job.Status == CaptureStatus.COMPLETED || job.Status == CaptureStatus.FAILED) break;
                Thread.Sleep(50);
            }

            // ALWAYS Release Shutter Button to OFF according to Canon EDSDK Lifecycle
            EdsSendCommand(CameraRef, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);

            // Light event pump after shutter release
            for (int i = 0; i < 4; i++) {
                EdsGetEvent();
                Thread.Sleep(20);
            }

            totalSw.Stop();
            job.TotalLatencyMs = totalSw.ElapsedMilliseconds;

            if (job.Status != CaptureStatus.COMPLETED) {
                if (job.Status == CaptureStatus.CAPTURING || job.Status == CaptureStatus.TRANSFERRING) {
                    job.Status = CaptureStatus.TIMED_OUT;
                    job.ErrorMessage = "Timeout: File transfer did not complete within 6000ms";
                    try { if (File.Exists(ActiveTmpPath)) File.Delete(ActiveTmpPath); } catch {}
                }
                FailedCapturesCount++;
                Log("ERROR", "CAPTURE_FAILED", job.ErrorMessage ?? "Unknown failure", job.SessionId, job.CaptureId, job.TotalLatencyMs);
            } else {
                TotalCapturesCount++;
                TotalCaptureLatencyMs += job.TotalLatencyMs;
                Log("INFO", "CAPTURE_SUCCESS", string.Format("Total {0}ms (Shutter {1}ms, Transfer {2}ms)", job.TotalLatencyMs, job.ShutterLatencyMs, job.TransferLatencyMs), job.SessionId, job.CaptureId, job.TotalLatencyMs);
            }

            lock (ActiveCaptureLock) {
                ActiveCapture = null;
                ActiveTmpPath = "";
            }

            // Restore Live View / Ready State
            CurrentState = CameraState.READY;
            job.DoneEvent.Set();
        }

        static void EnsureCameraConnected(ref int backoffMs) {
            if (CurrentState != CameraState.DISCONNECTED && CurrentState != CameraState.RECOVERING) return;

            try {
                CurrentState = CameraState.CONNECTING;
                IntPtr list;
                uint err = EdsGetCameraList(out list);
                if (err != 0) {
                    HandleDisconnect(ref backoffMs, "EdsGetCameraList failed: 0x" + err.ToString("X8"));
                    return;
                }

                int count = 0;
                EdsGetChildCount(list, out count);
                if (count > 0) {
                    IntPtr cam;
                    EdsGetChildAtIndex(list, 0, out cam);
                    uint openErr = EdsOpenSession(cam);
                    if (openErr != 0) {
                        for (int attempt = 0; attempt < 4; attempt++) {
                            Thread.Sleep(150);
                            openErr = EdsOpenSession(cam);
                            if (openErr == 0) break;
                        }
                    }

                    if (openErr == 0) {
                        CameraRef = cam;
                        ReconnectCount++;
                        backoffMs = 200; // Reset backoff

                        uint saveTo = kEdsSaveTo_Both;
                        uint stErr = EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(uint), ref saveTo);
                        if (stErr != 0) {
                            saveTo = kEdsSaveTo_Host;
                            EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(uint), ref saveTo);
                        }

                        EdsCapacity cap = new EdsCapacity { numberOfFreeClusters = 0x7FFFFFFF, bytesPerSector = 0x1000, reset = 1 };
                        EdsSetCapacity(cam, cap);

                        HandlerRef = new EdsObjectEventHandler(HandleObjectEvent);
                        EdsSetObjectEventHandler(cam, kEdsObjectEvent_All, HandlerRef, IntPtr.Zero);

                        StateHandlerRef = new EdsCameraStateEventHandler(HandleStateEvent);
                        EdsSetCameraStateEventHandler(cam, kEdsStateEvent_All, StateHandlerRef, IntPtr.Zero);

                        uint dev = kEdsEvfOutputDevice_PC;
                        EdsSetPropertyData(cam, kEdsPropID_Evf_OutputDevice, 0, sizeof(uint), ref dev);

                        CurrentState = CameraState.READY;
                        Log("INFO", "CAMERA_CONNECTED", "Canon EOS R100 session initialized and EVF PC mode enabled");
                    } else {
                        EdsRelease(cam);
                        HandleDisconnect(ref backoffMs, "EdsOpenSession failed: 0x" + openErr.ToString("X8"));
                    }
                } else {
                    HandleDisconnect(ref backoffMs, "No camera detected in list");
                }
                EdsRelease(list);
            } catch (Exception ex) {
                HandleDisconnect(ref backoffMs, "Connection exception: " + ex.Message);
            }
        }

        static void HandleDisconnect(ref int backoffMs, string reason) {
            CurrentState = CameraState.DISCONNECTED;
            if (CameraRef != IntPtr.Zero) {
                try { EdsCloseSession(CameraRef); } catch {}
                try { EdsRelease(CameraRef); } catch {}
                CameraRef = IntPtr.Zero;
            }
            Log("WARN", "CAMERA_DISCONNECTED", string.Format("{0}. Retrying in {1}ms", reason, backoffMs));
            Thread.Sleep(backoffMs);
            backoffMs = Math.Min(backoffMs * 2, 3000); // Exponential backoff capped at 3s
        }

        static void PullEvfFrame() {
            if (CameraRef == IntPtr.Zero) return;
            Stopwatch sw = Stopwatch.StartNew();
            try {
                IntPtr stream;
                uint strErr = EdsCreateMemoryStream(0, out stream);
                if (strErr != 0) return;
                IntPtr evfRef;
                uint evfErr = EdsCreateEvfImageRef(stream, out evfRef);
                if (evfErr == 0) {
                    uint dlErr = EdsDownloadEvfImage(CameraRef, evfRef);
                    if (dlErr == 0) {
                        ulong len;
                        EdsGetLength(stream, out len);
                        IntPtr ptr;
                        EdsGetPointer(stream, out ptr);
                        if (len > 0 && ptr != IntPtr.Zero) {
                            byte[] buf = new byte[len];
                            Marshal.Copy(ptr, buf, 0, (int)len);
                            lock (FrameLock) {
                                LatestEvfFrame = buf;
                            }
                            EvfFrameCountInSec++;
                        }
                    } else if (dlErr == 0x000000A2 || dlErr == 0x00000080 || dlErr == 0x00000006 || dlErr == 0x00000061 || dlErr == 0x00002003) {
                        Log("WARN", "EVF_DISCONNECT", string.Format("EDSDK Error 0x{0:X8} during EVF download. Triggering reconnect.", dlErr));
                        TriggerCameraReset("EVF error 0x" + dlErr.ToString("X8"));
                    }
                    EdsRelease(evfRef);
                }
                EdsRelease(stream);
            } catch { }

            sw.Stop();
            MeasuredEvfLatencyMs = sw.ElapsedMilliseconds;

            // Rolling FPS calculation
            if ((DateTime.Now - LastFpsCalculation).TotalSeconds >= 1.0) {
                MeasuredEvfFps = EvfFrameCountInSec / (DateTime.Now - LastFpsCalculation).TotalSeconds;
                EvfFrameCountInSec = 0;
                LastFpsCalculation = DateTime.Now;
            }
        }

        static void HandleRequest(HttpListenerContext ctx) {
            try {
                ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
                ctx.Response.Headers.Add("Access-Control-Allow-Headers", "*");

                if (ctx.Request.HttpMethod == "OPTIONS") {
                    ctx.Response.StatusCode = 200;
                    ctx.Response.Close();
                    return;
                }

                bool isHead = ctx.Request.HttpMethod == "HEAD";
                string path = ctx.Request.Url.AbsolutePath.ToLowerInvariant();

                // ─── 1. STATUS & CAMERA DIAGNOSTICS (FR-01, FR-09) ───────────────────
                if (path == "/status") {
                    uint aeMode = 0, tv = 0, av = 0, iso = 0, battery = 0;
                    if (CameraRef != IntPtr.Zero && (CurrentState == CameraState.READY || CurrentState == CameraState.LIVEVIEW)) {
                        uint pErr = EdsGetPropertyData(CameraRef, kEdsPropID_AEModeSelect, 0, sizeof(uint), out aeMode);
                        if (pErr == 0x00000061 || pErr == 0x00002003) {
                            TriggerCameraReset("Status query invalid handle 0x" + pErr.ToString("X8"));
                        } else {
                            EdsGetPropertyData(CameraRef, kEdsPropID_Tv, 0, sizeof(uint), out tv);
                            EdsGetPropertyData(CameraRef, kEdsPropID_Av, 0, sizeof(uint), out av);
                            EdsGetPropertyData(CameraRef, kEdsPropID_ISOSpeed, 0, sizeof(uint), out iso);
                            EdsGetPropertyData(CameraRef, kEdsPropID_BatteryLevel, 0, sizeof(uint), out battery);
                        }
                    }

                    bool isConn = (CameraRef != IntPtr.Zero && CurrentState != CameraState.DISCONNECTED && CurrentState != CameraState.ERROR && CurrentState != CameraState.RECOVERING);
                    string json = string.Format(
                        "{{\"connected\":{0},\"evfReady\":{1},\"cameraState\":\"{2}\",\"aeMode\":{3},\"tv\":\"0x{4:X}\",\"av\":\"0x{5:X}\",\"iso\":\"0x{6:X}\",\"battery\":{7},\"fps\":{8:F1},\"latencyMs\":{9},\"reconnectCount\":{10}}}",
                        isConn ? "true" : "false",
                        (LatestEvfFrame != null && isConn) ? "true" : "false",
                        CurrentState.ToString(),
                        aeMode, tv, av, iso, battery,
                        MeasuredEvfFps, MeasuredEvfLatencyMs, ReconnectCount
                    );
                    SendJson(ctx, json, isHead);
                    return;
                }

                if (path == "/wake" || path == "/api/camera/wake") {
                    bool awakened = false;
                    if (CameraRef != IntPtr.Zero && CurrentState != CameraState.DISCONNECTED && CurrentState != CameraState.RECOVERING) {
                        uint extErr = EdsSendCommand(CameraRef, kEdsCameraCommand_ExtendShutDownTimer, 0);
                        awakened = (extErr == 0);
                        Log("INFO", "WAKE_REQUEST", "Wake command sent: ExtendShutDownTimer returned 0x" + extErr.ToString("X8"));
                        if (extErr == 0x00000061 || extErr == 0x00002003) {
                            TriggerCameraReset("Wake invalid handle");
                        }
                    } else {
                        Log("INFO", "WAKE_DISCONNECTED", "Wake requested while camera disconnected. Forcing rapid reconnect poll.");
                    }
                    string wakeJson = string.Format(
                        "{{\"success\":{0},\"connected\":{1},\"cameraState\":\"{2}\"}}",
                        awakened ? "true" : "false",
                        (CameraRef != IntPtr.Zero && CurrentState != CameraState.DISCONNECTED && CurrentState != CameraState.RECOVERING) ? "true" : "false",
                        CurrentState.ToString()
                    );
                    SendJson(ctx, wakeJson, isHead);
                    return;
                }

                if (path == "/api/diagnostics") {
                    StringBuilder logsSb = new StringBuilder();
                    lock (LogsLock) {
                        for (int i = 0; i < RecentLogs.Count; i++) {
                            if (i > 0) logsSb.Append(",");
                            logsSb.Append(RecentLogs[i].ToJson());
                        }
                    }

                    double avgLatency = TotalCapturesCount > 0 ? (double)TotalCaptureLatencyMs / TotalCapturesCount : 0;
                    string diagJson = string.Format(
                        "{{\"cameraState\":\"{0}\",\"connected\":{1},\"evfReady\":{2},\"evfFps\":{3:F1},\"evfLatencyMs\":{4},\"activeLiveViewClients\":{5},\"reconnectCount\":{6},\"totalCaptures\":{7},\"failedCaptures\":{8},\"averageCaptureLatencyMs\":{9:F1},\"recentLogs\":[{10}]}}",
                        CurrentState.ToString(),
                        (CameraRef != IntPtr.Zero && CurrentState != CameraState.DISCONNECTED) ? "true" : "false",
                        (LatestEvfFrame != null) ? "true" : "false",
                        MeasuredEvfFps,
                        MeasuredEvfLatencyMs,
                        ActiveLiveViewClients,
                        ReconnectCount,
                        TotalCapturesCount,
                        FailedCapturesCount,
                        avgLatency,
                        logsSb.ToString()
                    );
                    SendJson(ctx, diagJson, isHead);
                    return;
                }

                // ─── 2. LIVE VIEW FRAME & MJPEG (FR-04) ─────────────────────────────
                if (path == "/frame") {
                    byte[] frame = null;
                    lock (FrameLock) {
                        frame = LatestEvfFrame;
                    }
                    if (frame != null && frame.Length > 0) {
                        ctx.Response.ContentType = "image/jpeg";
                        ctx.Response.ContentLength64 = frame.Length;
                        if (!isHead) {
                            ctx.Response.OutputStream.Write(frame, 0, frame.Length);
                        }
                    } else {
                        ctx.Response.StatusCode = 404;
                    }
                    ctx.Response.Close();
                    return;
                }

                if (path == "/liveview") {
                    Interlocked.Increment(ref ActiveLiveViewClients);
                    ctx.Response.ContentType = "multipart/x-mixed-replace; boundary=--myboundary";
                    var output = ctx.Response.OutputStream;
                    try {
                        while (ctx.Response.OutputStream.CanWrite && !ShouldExit) {
                            byte[] frame = null;
                            lock (FrameLock) { frame = LatestEvfFrame; }
                            if (frame != null && frame.Length > 0) {
                                byte[] header = Encoding.ASCII.GetBytes("\r\n--myboundary\r\nContent-Type: image/jpeg\r\nContent-Length: " + frame.Length + "\r\n\r\n");
                                output.Write(header, 0, header.Length);
                                output.Write(frame, 0, frame.Length);
                                output.Flush();
                            }
                            Thread.Sleep(30); // ~33 FPS
                        }
                    } catch { }
                    finally {
                        Interlocked.Decrement(ref ActiveLiveViewClients);
                    }
                    return;
                }

                // ─── 3. IDEMPOTENT CAPTURE API (FR-03, FR-05) ───────────────────────
                if (path == "/api/captures" && ctx.Request.HttpMethod == "POST") {
                    string bodyText = "";
                    using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
                        bodyText = reader.ReadToEnd();
                    }

                    string captureId = ExtractJsonString(bodyText, "captureId");
                    string sessionId = ExtractJsonString(bodyText, "sessionId");
                    int slotIndex = ExtractJsonInt(bodyText, "slotIndex", 0);

                    if (string.IsNullOrEmpty(captureId)) {
                        captureId = "cap_" + DateTime.Now.Ticks;
                    }
                    if (string.IsNullOrEmpty(sessionId)) {
                        sessionId = "session_default";
                    }

                    // Check Idempotency Map
                    CaptureRecord existingRecord;
                    if (IdempotencyMap.TryGetValue(captureId, out existingRecord)) {
                        Log("INFO", "IDEMPOTENT_HIT", string.Format("Duplicate request for captureId {0}. State is {1}", captureId, existingRecord.Status), sessionId, captureId);

                        // If already completed, return existing result immediately
                        if (existingRecord.Status == CaptureStatus.COMPLETED) {
                            string resJson = string.Format(
                                "{{\"success\":true,\"status\":\"COMPLETED\",\"idempotent\":true,\"captureId\":\"{0}\",\"sessionId\":\"{1}\",\"slotIndex\":{2},\"savedPath\":\"{3}\",\"sizeBytes\":{4},\"latencyMs\":{5},\"source\":\"Canon EOS R100 (EDSDK Daemon 2.2)\",\"resolution\":\"24MP\"}}",
                                existingRecord.CaptureId, existingRecord.SessionId, existingRecord.SlotIndex,
                                existingRecord.FinalPath.Replace("\\", "\\\\"), existingRecord.SizeBytes, existingRecord.TotalLatencyMs);
                            SendJson(ctx, resJson, isHead);
                            return;
                        }

                        // If in progress, wait for existing job
                        if (existingRecord.Status == CaptureStatus.PENDING || existingRecord.Status == CaptureStatus.CAPTURING || existingRecord.Status == CaptureStatus.TRANSFERRING) {
                            existingRecord.DoneEvent.WaitOne(6500);
                            bool succ = (existingRecord.Status == CaptureStatus.COMPLETED);
                            string resJson = string.Format(
                                "{{\"success\":{0},\"status\":\"{1}\",\"idempotent\":true,\"captureId\":\"{2}\",\"savedPath\":\"{3}\",\"sizeBytes\":{4},\"latencyMs\":{5},\"error\":\"{6}\"}}",
                                succ ? "true" : "false",
                                existingRecord.Status.ToString(),
                                existingRecord.CaptureId,
                                (existingRecord.FinalPath ?? "").Replace("\\", "\\\\"),
                                existingRecord.SizeBytes,
                                existingRecord.TotalLatencyMs,
                                (existingRecord.ErrorMessage ?? "").Replace("\"", "\\\""));
                            SendJson(ctx, resJson, isHead);
                            return;
                        }

                        // If previously failed or timed out, do NOT re-trigger shutter automatically
                        string failJson = string.Format(
                            "{{\"success\":false,\"status\":\"{0}\",\"idempotent\":true,\"captureId\":\"{1}\",\"error\":\"{2}\"}}",
                            existingRecord.Status.ToString(), existingRecord.CaptureId, (existingRecord.ErrorMessage ?? "Previous capture failed").Replace("\"", "\\\""));
                        SendJson(ctx, failJson, isHead);
                        return;
                    }

                    // New Capture Request: Sandboxed destination path
                    string safeBaseDir = @"F:\Fotolism_image\sessions\" + SanitizePath(sessionId);
                    string finalPath = Path.Combine(safeBaseDir, string.Format("raw_slot_{0}_{1}.jpg", slotIndex, SanitizePath(captureId)));

                    CaptureRecord newJob = new CaptureRecord {
                        CaptureId = captureId,
                        SessionId = sessionId,
                        SlotIndex = slotIndex,
                        Status = CaptureStatus.PENDING,
                        FinalPath = finalPath
                    };

                    IdempotencyMap[captureId] = newJob;
                    CommandQueue.Enqueue(newJob);

                    // Wait for completion (up to 7 seconds)
                    bool finished = newJob.DoneEvent.WaitOne(7000);

                    string responseJson;
                    if (finished && newJob.Status == CaptureStatus.COMPLETED) {
                        responseJson = string.Format(
                            "{{\"success\":true,\"status\":\"COMPLETED\",\"idempotent\":false,\"captureId\":\"{0}\",\"sessionId\":\"{1}\",\"slotIndex\":{2},\"savedPath\":\"{3}\",\"sizeBytes\":{4},\"latencyMs\":{5},\"shutterMs\":{6},\"transferMs\":{7},\"source\":\"Canon EOS R100 (EDSDK Daemon 2.2)\",\"resolution\":\"24MP (Full Resolution)\"}}",
                            newJob.CaptureId, newJob.SessionId, newJob.SlotIndex,
                            newJob.FinalPath.Replace("\\", "\\\\"),
                            newJob.SizeBytes,
                            newJob.TotalLatencyMs,
                            newJob.ShutterLatencyMs,
                            newJob.TransferLatencyMs
                        );
                    } else {
                        string err = finished ? (newJob.ErrorMessage ?? "Capture execution failed") : "Timeout: Camera daemon did not finish within 7000ms";
                        responseJson = string.Format(
                            "{{\"success\":false,\"status\":\"{0}\",\"idempotent\":false,\"captureId\":\"{1}\",\"error\":\"{2}\"}}",
                            newJob.Status.ToString(), newJob.CaptureId, err.Replace("\\", "\\\\").Replace("\"", "\\\"")
                        );
                    }

                    SendJson(ctx, responseJson, isHead);
                    return;
                }

                // ─── 4. LEGACY CAPTURE API (/capture?savePath=...) ─────────────────
                if (path == "/capture") {
                    string savePath = ctx.Request.QueryString["savePath"];
                    if (string.IsNullOrEmpty(savePath)) {
                        savePath = @"F:\Fotolism_image\fotolism_shot_" + DateTime.Now.Ticks + ".jpg";
                    }

                    string capId = "legacy_" + DateTime.Now.Ticks;
                    CaptureRecord legacyJob = new CaptureRecord {
                        CaptureId = capId,
                        SessionId = "legacy_session",
                        SlotIndex = 0,
                        Status = CaptureStatus.PENDING,
                        FinalPath = savePath
                    };

                    IdempotencyMap[capId] = legacyJob;
                    CommandQueue.Enqueue(legacyJob);

                    bool finished = legacyJob.DoneEvent.WaitOne(7000);
                    string resJson;
                    if (finished && legacyJob.Status == CaptureStatus.COMPLETED) {
                        resJson = string.Format(
                            "{{\"success\":true,\"savedPath\":\"{0}\",\"sizeBytes\":{1},\"latencyMs\":{2},\"source\":\"Canon EOS R100 (EDSDK Persistent Daemon 2.2)\",\"resolution\":\"24MP (Full Resolution)\"}}",
                            legacyJob.FinalPath.Replace("\\", "\\\\"), legacyJob.SizeBytes, legacyJob.TotalLatencyMs);
                    } else {
                        string err = finished ? legacyJob.ErrorMessage : "Timeout: Camera daemon không phản hồi sau 7.0s";
                        resJson = string.Format("{{\"success\":false,\"error\":\"{0}\"}}", (err ?? "Capture error").Replace("\"", "\\\""));
                    }

                    SendJson(ctx, resJson, isHead);
                    return;
                }

                if (path == "/quit") {
                    ShouldExit = true;
                    SendJson(ctx, "{\"ok\":true}", isHead);
                    return;
                }

                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
            } catch (Exception ex) {
                try { ctx.Response.Abort(); } catch { }
                Log("ERROR", "HTTP_REQUEST_ERROR", ex.Message);
            }
        }

        private static void SendJson(HttpListenerContext ctx, string json, bool isHead) {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            ctx.Response.ContentType = "application/json";
            ctx.Response.ContentLength64 = bytes.Length;
            if (!isHead) {
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            }
            ctx.Response.Close();
        }

        private static string ExtractJsonString(string json, string key) {
            Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
            if (m.Success) return m.Groups[1].Value;
            return "";
        }

        private static int ExtractJsonInt(string json, string key, int defaultVal) {
            Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*([0-9]+)");
            if (m.Success) {
                int res;
                if (int.TryParse(m.Groups[1].Value, out res)) return res;
            }
            return defaultVal;
        }

        private static string SanitizePath(string input) {
            if (string.IsNullOrEmpty(input)) return "unnamed";
            foreach (char c in Path.GetInvalidFileNameChars()) {
                input = input.Replace(c, '_');
            }
            return input.Replace("..", "_").Trim();
        }
    }
}
