using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Fotolism {
    class Program {
        public const uint kEdsPropID_SaveTo = 0x0000000b;
        public const uint kEdsSaveTo_Host = 2;
        public const uint kEdsSaveTo_Both = 3;
        public const uint kEdsCameraCommand_TakePicture = 0x00000000;
        public const uint kEdsCameraCommand_ExtendShutDownTimer = 0x00000001;
        public const uint kEdsCameraCommand_PressShutterButton = 0x00000004;
        public const int kEdsCameraCommand_ShutterButton_OFF = 0x00000000;
        public const int kEdsCameraCommand_ShutterButton_Halfway = 0x00000001;
        public const int kEdsCameraCommand_ShutterButton_Completely = 0x00000003;
        public const int kEdsCameraCommand_ShutterButton_Completely_NonAF = 0x00010003;

        public const uint kEdsObjectEvent_All = 0x00000200;
        public const uint kEdsObjectEvent_DirItemRequestTransfer = 0x00000208;
        public const uint kEdsObjectEvent_DirItemCreated = 0x00000204;

        [StructLayout(LayoutKind.Sequential)]
        public struct EdsCapacity {
            public int numberOfFreeClusters;
            public int bytesPerSector;
            public int reset;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct EdsDirectoryItemInfo {
            public ulong size;
            public int isFolder;
            public uint groupID;
            public uint option;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string szFileName;
            public uint format;
            public uint dateTime;
        }

        public delegate uint EdsObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool SetDllDirectory(string lpPathName);

        static Program() {
            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string localEdsdk = Path.Combine(baseDir, "EDSDK.dll");
                if (File.Exists(localEdsdk)) {
                    SetDllDirectory(baseDir);
                } else {
                    string canonWebcamDir = @"C:\Program Files\Canon\EOS Webcam Utility Pro";
                    if (Directory.Exists(canonWebcamDir)) {
                        SetDllDirectory(canonWebcamDir);
                    }
                }
            } catch { }
        }

        [DllImport("EDSDK.dll")]
        public static extern uint EdsInitializeSDK();

        [DllImport("EDSDK.dll")]
        public static extern uint EdsTerminateSDK();

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetCameraList(out IntPtr cameraList);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetChildAtIndex(IntPtr inRef, int index, out IntPtr outRef);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsOpenSession(IntPtr camera);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsCloseSession(IntPtr camera);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsSendCommand(IntPtr camera, uint command, int param);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetPropertyData(IntPtr camera, uint propId, int param, int size, ref uint data);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetCapacity(IntPtr camera, EdsCapacity capacity);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetObjectEventHandler(IntPtr camera, uint inEvent, EdsObjectEventHandler inEventHandler, IntPtr inContext);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetDirectoryItemInfo(IntPtr dirItem, out EdsDirectoryItemInfo outInfo);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsCreateFileStream([MarshalAs(UnmanagedType.LPStr)] string inFileName, uint inCreateDisposition, uint inDesiredAccess, out IntPtr outStream);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsDownload(IntPtr dirItem, ulong inReadSize, IntPtr outStream);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsDownloadComplete(IntPtr dirItem);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer);

        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetEvent();

        [DllImport("EDSDK.dll")]
        public static extern uint EdsRelease(IntPtr inRef);

        private static string TargetFilePath = "";
        private static bool DownloadSuccess = false;
        private static string ErrorMessage = "";
        private static EdsObjectEventHandler eventHandlerRef;

        public static uint HandleObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext) {
            Console.Error.WriteLine("[EVENT] inEvent: 0x{0:X8}", inEvent);
            if (inEvent == kEdsObjectEvent_DirItemRequestTransfer || inEvent == kEdsObjectEvent_DirItemCreated) {
                if (DownloadSuccess) {
                    if (inRef != IntPtr.Zero) EdsRelease(inRef);
                    return 0;
                }
                try {
                    EdsDirectoryItemInfo itemInfo;
                    uint err = EdsGetDirectoryItemInfo(inRef, out itemInfo);
                    Console.Error.WriteLine("[EVENT] EdsGetDirectoryItemInfo: 0x{0:X8}, size: {1}, file: {2}", err, itemInfo.size, itemInfo.szFileName);
                    if (err != 0) {
                        ErrorMessage = string.Format("Lỗi lấy thông tin file ảnh Canon (0x{0:X8})", err);
                    } else if (itemInfo.size > 0 && !DownloadSuccess) {
                        string dir = Path.GetDirectoryName(TargetFilePath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) {
                            Directory.CreateDirectory(dir);
                        }

                        IntPtr fileStream = IntPtr.Zero;
                        // kEdsFileCreateDisposition_CreateAlways = 1, kEdsAccess_ReadWrite = 2
                        err = EdsCreateFileStream(TargetFilePath, 1, 2, out fileStream);
                        Console.Error.WriteLine("[EVENT] EdsCreateFileStream to '{0}': 0x{1:X8}", TargetFilePath, err);
                        if (err != 0) {
                            ErrorMessage = string.Format("Lỗi tạo file stream lưu ảnh (0x{0:X8})", err);
                        } else {
                            err = EdsDownload(inRef, itemInfo.size, fileStream);
                            Console.Error.WriteLine("[EVENT] EdsDownload: 0x{0:X8}", err);
                            uint compErr = EdsDownloadComplete(inRef);
                            Console.Error.WriteLine("[EVENT] EdsDownloadComplete: 0x{0:X8}", compErr);
                            EdsRelease(fileStream);

                            if (err != 0) {
                                ErrorMessage = string.Format("Lỗi truyền dữ liệu ảnh từ máy ảnh (0x{0:X8})", err);
                            } else if (File.Exists(TargetFilePath) && new FileInfo(TargetFilePath).Length > 1000) {
                                DownloadSuccess = true;
                                Console.Error.WriteLine("[EVENT] DownloadSuccess = true, size: {0}", new FileInfo(TargetFilePath).Length);
                            }
                        }
                    }
                } catch (Exception ex) {
                    Console.Error.WriteLine("[EVENT] Exception: {0}", ex.Message);
                    ErrorMessage = ex.Message;
                } finally {
                    if (inRef != IntPtr.Zero) {
                        EdsRelease(inRef);
                    }
                }
            } else if (inRef != IntPtr.Zero) {
                EdsRelease(inRef);
            }
            return 0;
        }

        static int Main(string[] args) {
            Stopwatch sw = Stopwatch.StartNew();
            Console.OutputEncoding = Encoding.UTF8;

            if (args.Length == 0) {
                Console.WriteLine("{\"success\":false,\"error\":\"Thiếu tham số đường dẫn lưu ảnh (-savePath)\"}");
                return 1;
            }

            string savePath = args[0];
            if (savePath.Equals("-savePath", StringComparison.OrdinalIgnoreCase) && args.Length > 1) {
                savePath = args[1];
            }

            if (savePath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase) && !Directory.Exists("D:\\")) {
                savePath = "F:\\" + savePath.Substring(3);
            }
            TargetFilePath = savePath;

            uint err = EdsInitializeSDK();
            if (err != 0) {
                Console.WriteLine("{{\"success\":false,\"error\":\"Không thể khởi tạo Canon EDSDK (0x{0:X8})\"}}", err);
                return 1;
            }

            try {
                IntPtr camList = IntPtr.Zero;
                err = EdsGetCameraList(out camList);
                if (err != 0) {
                    Console.WriteLine("{{\"success\":false,\"error\":\"Lỗi tìm danh sách máy ảnh (0x{0:X8})\"}}", err);
                    return 1;
                }

                int count = 0;
                EdsGetChildCount(camList, out count);
                if (count == 0) {
                    EdsRelease(camList);
                    Console.WriteLine("{\"success\":false,\"error\":\"Chưa phát hiện máy ảnh Canon EOS! Vui lòng bật ON công tắc máy ảnh.\"}");
                    return 1;
                }

                IntPtr cam = IntPtr.Zero;
                EdsGetChildAtIndex(camList, 0, out cam);

                uint lastSessionErr = EdsOpenSession(cam);
                if (lastSessionErr != 0) {
                    // Retry nhanh nếu camera đang nhả session trước
                    for (int attempt = 0; attempt < 5; attempt++) {
                        Thread.Sleep(150);
                        lastSessionErr = EdsOpenSession(cam);
                        if (lastSessionErr == 0) break;
                    }
                }

                if (lastSessionErr != 0) {
                    EdsRelease(cam);
                    EdsRelease(camList);
                    if (lastSessionErr == 0x00000002) {
                        Console.WriteLine("{\"success\":false,\"error\":\"Máy ảnh Canon EOS đang ở chế độ ngủ (Sleep Mode). Vui lòng bấm nhẹ nút chụp trên máy ảnh để đánh thức.\"}");
                    } else if (lastSessionErr == 0x00000081) {
                        Console.WriteLine("{\"success\":false,\"error\":\"Cổng kết nối máy ảnh đang bận (Device Busy 0x00000081). Vui lòng thử lại.\"}");
                    } else {
                        Console.WriteLine("{{\"success\":false,\"error\":\"Không thể mở phiên kết nối máy ảnh Canon (0x{0:X8})\"}}", lastSessionErr);
                    }
                    return 1;
                }

                // Thiết lập cấu hình lưu ảnh tức thì
                uint saveTo = kEdsSaveTo_Both;
                EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(uint), ref saveTo);

                EdsCapacity cap = new EdsCapacity {
                    numberOfFreeClusters = 0x7FFFFFFF,
                    bytesPerSector = 0x1000,
                    reset = 1
                };
                EdsSetCapacity(cam, cap);

                eventHandlerRef = new EdsObjectEventHandler(HandleObjectEvent);
                EdsSetObjectEventHandler(cam, kEdsObjectEvent_All, eventHandlerRef, IntPtr.Zero);
                EdsGetEvent();

            bool useAF = true;
            for (int i = 0; i < args.Length; i++) {
                if (args[i].Equals("-noaf", StringComparison.OrdinalIgnoreCase)) {
                    useAF = false;
                }
            }

            if (useAF) {
                // Kích hoạt Dual Pixel AF lấy nét chuẩn xác (Halfway 250ms)
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Halfway);
                for (int s = 0; s < 5; s++) { EdsGetEvent(); Thread.Sleep(50); }
                // Nhấn chụp màn trập
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely);
            } else {
                // Bỏ qua AF chụp tức thì
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
            }

            // Chờ nhận file ảnh truyền trực tiếp qua USB (bơm sự kiện liên tục)
            for (int i = 0; i < 70; i++) {
                EdsGetEvent();
                if (DownloadSuccess) break;
                Thread.Sleep(100);
            }

            // Luôn nhả nút chụp an toàn sau khi kết thúc chu trình
            EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);

                EdsCloseSession(cam);
                EdsRelease(cam);
                EdsRelease(camList);

                sw.Stop();
                if (DownloadSuccess && File.Exists(savePath)) {
                    long size = new FileInfo(savePath).Length;
                    Console.WriteLine("{{\"success\":true,\"savedPath\":{0},\"sizeBytes\":{1},\"source\":\"Canon EOS R100 (Native Zero-Delay)\",\"resolution\":\"24MP (Full Resolution)\",\"latencyMs\":{2}}}",
                        ToLiteral(savePath), size, sw.ElapsedMilliseconds);
                    return 0;
                } else {
                    string errStr = string.IsNullOrEmpty(ErrorMessage) ? "Timeout: Không nhận được file ảnh trả về sau khi bấm máy" : ErrorMessage;
                    Console.WriteLine("{{\"success\":false,\"error\":{0}}}", ToLiteral(errStr));
                    return 1;
                }
            } finally {
                EdsTerminateSDK();
            }
        }

        private static string ToLiteral(string input) {
            StringBuilder sb = new StringBuilder();
            sb.Append("\"");
            foreach (char c in input) {
                switch (c) {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default: sb.Append(c); break;
                }
            }
            sb.Append("\"");
            return sb.ToString();
        }
    }
}
