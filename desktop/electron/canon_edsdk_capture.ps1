param(
    [Parameter(Mandatory=$true)]
    [string]$savePath
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Đảm bảo đường dẫn hợp lệ trên máy tính (nếu D:\ không tồn tại thì tự động chuyển sang F:\)
if ($savePath -like "D:\*" -and -not (Test-Path "D:\")) {
    $savePath = $savePath -replace "^D:\\", "F:\"
}
$targetDir = [System.IO.Path]::GetDirectoryName($savePath)
if (-not [string]::IsNullOrEmpty($targetDir) -and -not (Test-Path $targetDir)) {
    [System.IO.Directory]::CreateDirectory($targetDir) | Out-Null
}

# Tự động giải phóng cổng USB nếu có tiến trình khác đang chiếm giữ (như CameraControlCmd / digiCamControl cũ)
Get-Process | Where-Object ProcessName -match 'cameracontrol|digicam' | Stop-Process -Force -ErrorAction SilentlyContinue

$edsdkPath = 'C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll'
if (-not (Test-Path $edsdkPath)) {
    $out = @{ success = $false; error = "Không tìm thấy driver Canon EDSDK 64-bit tại $edsdkPath" }
    Write-Output (ConvertTo-Json $out)
    exit 1
}

$source = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public class CanonNativeCapture {
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

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsInitializeSDK();

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsTerminateSDK();

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetCameraList(out IntPtr cameraList);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetChildAtIndex(IntPtr inRef, int index, out IntPtr outRef);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsOpenSession(IntPtr camera);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsCloseSession(IntPtr camera);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsSendCommand(IntPtr camera, uint command, int param);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsSetPropertyData(IntPtr camera, uint propId, int param, int size, ref uint data);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsSetCapacity(IntPtr camera, EdsCapacity capacity);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsSetObjectEventHandler(IntPtr camera, uint inEvent, EdsObjectEventHandler inEventHandler, IntPtr inContext);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetDirectoryItemInfo(IntPtr dirItem, out EdsDirectoryItemInfo outInfo);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsCreateMemoryStream(ulong inSize, out IntPtr outStream);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsDownload(IntPtr dirItem, ulong inReadSize, IntPtr outStream);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsDownloadComplete(IntPtr dirItem);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer);

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsGetEvent();

    [DllImport(@"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll")]
    public static extern uint EdsRelease(IntPtr inRef);

    public static string TargetFilePath = "";
    public static bool DownloadSuccess = false;
    public static string ErrorMessage = "";
    private static EdsObjectEventHandler eventHandlerRef;

    public static uint HandleObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext) {
        if (inEvent == kEdsObjectEvent_DirItemRequestTransfer || inEvent == kEdsObjectEvent_DirItemCreated) {
            try {
                EdsDirectoryItemInfo itemInfo;
                uint err = EdsGetDirectoryItemInfo(inRef, out itemInfo);
                if (err == 0 && itemInfo.size > 0 && !DownloadSuccess) {
                    IntPtr memStream = IntPtr.Zero;
                    err = EdsCreateMemoryStream(itemInfo.size, out memStream);
                    if (err == 0) {
                        err = EdsDownload(inRef, itemInfo.size, memStream);
                        EdsDownloadComplete(inRef);

                        if (err == 0) {
                            IntPtr ptr = IntPtr.Zero;
                            err = EdsGetPointer(memStream, out ptr);
                            if (err == 0 && ptr != IntPtr.Zero) {
                                byte[] bytes = new byte[itemInfo.size];
                                Marshal.Copy(ptr, bytes, 0, (int)itemInfo.size);
                                string dir = Path.GetDirectoryName(TargetFilePath);
                                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                File.WriteAllBytes(TargetFilePath, bytes);
                                DownloadSuccess = true;
                            }
                        }
                        EdsRelease(memStream);
                    }
                }
            } catch (Exception ex) {
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

    public static bool Shoot(string savePath, out string error) {
        TargetFilePath = savePath;
        DownloadSuccess = false;
        ErrorMessage = "";
        error = "";

        uint err = EdsInitializeSDK();
        if (err != 0) {
            error = "EdsInitializeSDK failed (0x" + err.ToString("X8") + ")";
            return false;
        }

        try {
            IntPtr camList = IntPtr.Zero;
            err = EdsGetCameraList(out camList);
            if (err != 0) {
                error = "EdsGetCameraList failed (0x" + err.ToString("X8") + ")";
                return false;
            }

            int count = 0;
            EdsGetChildCount(camList, out count);
            if (count == 0) {
                Thread.Sleep(300);
                EdsRelease(camList);
                err = EdsGetCameraList(out camList);
                if (err != 0) {
                    error = "EdsGetCameraList retry failed (0x" + err.ToString("X8") + ")";
                    return false;
                }
                EdsGetChildCount(camList, out count);
                if (count == 0) {
                    EdsRelease(camList);
                    error = "Chưa phát hiện máy ảnh Canon EOS! Vui lòng cắm cáp USB và gạt công tắc nguồn máy ảnh sang ON.";
                    return false;
                }
            }

            IntPtr cam = IntPtr.Zero;
            bool sessionOpened = false;
            uint lastSessionErr = 0;

            for (int i = 0; i < count; i++) {
                IntPtr candidateCam = IntPtr.Zero;
                uint getChildErr = EdsGetChildAtIndex(camList, i, out candidateCam);
                if (getChildErr != 0 || candidateCam == IntPtr.Zero) continue;

                // Thử mở session tối đa 8 lần với progressive delay (xử lý camera vừa chụp hoặc đang bận)
                for (int attempt = 0; attempt < 8; attempt++) {
                    lastSessionErr = EdsOpenSession(candidateCam);
                    if (lastSessionErr == 0) {
                        cam = candidateCam;
                        sessionOpened = true;
                        break;
                    }
                    Thread.Sleep(300);
                }

                if (sessionOpened) break;
                EdsRelease(candidateCam);
            }

            if (!sessionOpened || cam == IntPtr.Zero) {
                EdsRelease(camList);
                if (lastSessionErr == 0x00000002) {
                    error = "Máy ảnh Canon EOS đang ở chế độ ngủ (Sleep Mode) hoặc vừa ngắt kết nối. Vui lòng bấm nhẹ nút chụp trên máy ảnh để đánh thức (0x00000002).";
                } else if (lastSessionErr == 0x00000081) {
                    error = "Cổng kết nối máy ảnh đang bận (Device Busy 0x00000081). Vui lòng thử bấm chụp lại sau 1-2 giây.";
                } else {
                    error = "Không thể mở phiên kết nối máy ảnh Canon (0x" + lastSessionErr.ToString("X8") + ")";
                }
                return false;
            }

            // Gia hạn timer để ngăn máy ảnh ngủ
            EdsSendCommand(cam, kEdsCameraCommand_ExtendShutDownTimer, 0);
            Thread.Sleep(200);

            uint saveTo = kEdsSaveTo_Both;
            for (int r = 0; r < 5; r++) {
                uint pErr = EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(uint), ref saveTo);
                if (pErr == 0) break;
                if (pErr == 0x00000081) {
                    Thread.Sleep(300);
                    continue;
                }
                // Thử fallback kEdsSaveTo_Host nếu máy không có thẻ SD
                saveTo = kEdsSaveTo_Host;
                EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(uint), ref saveTo);
                break;
            }

            EdsCapacity cap = new EdsCapacity {
                numberOfFreeClusters = 0x7FFFFFFF,
                bytesPerSector = 0x1000,
                reset = 1
            };
            for (int r = 0; r < 5; r++) {
                uint cErr = EdsSetCapacity(cam, cap);
                if (cErr == 0) break;
                Thread.Sleep(200);
            }

            eventHandlerRef = new EdsObjectEventHandler(HandleObjectEvent);
            EdsSetObjectEventHandler(cam, kEdsObjectEvent_All, eventHandlerRef, IntPtr.Zero);
            EdsGetEvent();

            // 1. Thử gửi lệnh chụp TakePicture
            uint takeErr = EdsSendCommand(cam, kEdsCameraCommand_TakePicture, 0);

            // 2. Nếu TakePicture trả về lỗi (ví dụ không lock được AF), kích hoạt bằng mô phỏng nút chụp cơ bản
            if (takeErr != 0) {
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Halfway);
                Thread.Sleep(200);
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely);
                Thread.Sleep(300);
                EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
            }

            // Chờ sự kiện trả về ảnh từ máy ảnh (14 giây)
            for (int i = 0; i < 140; i++) {
                EdsGetEvent();
                if (DownloadSuccess) break;
                Thread.Sleep(100);
            }

            EdsCloseSession(cam);
            EdsRelease(cam);
            EdsRelease(camList);

            if (DownloadSuccess && File.Exists(savePath)) {
                return true;
            } else {
                error = string.IsNullOrEmpty(ErrorMessage) ? "Timeout: Không nhận được file ảnh trả về sau khi bấm máy" : ErrorMessage;
                return false;
            }
        } finally {
            EdsTerminateSDK();
        }
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp

$errorMsg = ""
$success = [CanonNativeCapture]::Shoot($savePath, [ref]$errorMsg)

if ($success -and (Test-Path $savePath)) {
    try {
        Add-Type -AssemblyName System.Drawing
        $fs = [System.IO.File]::OpenRead($savePath)
        $bmp = [System.Drawing.Bitmap]::FromStream($fs)
        $fs.Close()
        $bmp.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
        $bmp.Save($savePath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bmp.Dispose()
    } catch {
        # Không làm gián đoạn luồng nếu System.Drawing gặp cảnh báo
    }
    $size = (Get-Item $savePath).Length
    $out = @{
        success = $true
        savedPath = $savePath
        sizeBytes = $size
        source = "Canon EOS R100 (Native 64-bit EDSDK)"
        resolution = "24MP (Full Resolution)"
    }
    Write-Output (ConvertTo-Json $out)
    exit 0
} else {
    $out = @{
        success = $false
        error = $errorMsg
    }
    Write-Output (ConvertTo-Json $out)
    exit 1
}
