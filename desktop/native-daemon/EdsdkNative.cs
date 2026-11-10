using System;
using System.IO;
using System.Runtime.InteropServices;

namespace FotolismCanonDaemon {
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

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate uint EdsCameraStateEventHandler(uint inEvent, uint inParameter, IntPtr inContext);

    public delegate uint EdsObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);

    public static class EdsdkNative {
        public const uint kEdsPropID_SaveTo = 0x0000000b;
        public const uint kEdsSaveTo_Host = 2;
        public const uint kEdsSaveTo_Both = 3;
        public const uint kEdsPropID_Evf_OutputDevice = 0x00000500;
        public const uint kEdsEvfOutputDevice_PC = 2;

        public const uint kEdsPropID_AEModeSelect = 0x00000400;
        public const uint kEdsPropID_Tv = 0x00000405;
        public const uint kEdsPropID_Av = 0x00000404;
        public const uint kEdsPropID_ISOSpeed = 0x00000402;
        public const uint kEdsPropID_BatteryLevel = 0x00000407;

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
        public const uint kEdsObjectEvent_DirItemRequestTransferDT = 0x00000209;

        public const uint kEdsStateEvent_All = 0x00000300;
        public const uint kEdsStateEvent_Shutdown = 0x00000301;
        public const uint kEdsStateEvent_JobStatusChanged = 0x00000302;
        public const uint kEdsStateEvent_WillSoonShutDown = 0x00000303;
        public const uint kEdsStateEvent_ShutDownTimerUpdate = 0x00000304;
        public const uint kEdsStateEvent_CaptureError = 0x00000305;
        public const uint kEdsStateEvent_InternalError = 0x00000306;
        public const uint kEdsStateEvent_AfResult = 0x00000309;

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool SetDllDirectory(string lpPathName);

        static EdsdkNative() {
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
        public static extern uint EdsGetCameraList(out IntPtr list);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetChildCount(IntPtr inRef, out int count);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetChildAtIndex(IntPtr inRef, int index, out IntPtr outRef);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsOpenSession(IntPtr cam);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsCloseSession(IntPtr cam);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsSendCommand(IntPtr camera, uint command, int param);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetPropertyData(IntPtr cam, uint propId, int param, int size, ref uint data);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, out uint outPropertyData);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetCapacity(IntPtr camera, EdsCapacity capacity);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsSetObjectEventHandler(IntPtr camera, uint inEvent, EdsObjectEventHandler inEventHandler, IntPtr inContext);
        [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern uint EdsSetCameraStateEventHandler(IntPtr camera, uint inEvent, EdsCameraStateEventHandler inEventHandler, IntPtr inContext);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetDirectoryItemInfo(IntPtr dirItem, out EdsDirectoryItemInfo outInfo);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsCreateFileStream([MarshalAs(UnmanagedType.LPStr)] string inFileName, uint inCreateDisposition, uint inDesiredAccess, out IntPtr outStream);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsDownload(IntPtr dirItem, ulong inReadSize, IntPtr outStream);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsDownloadComplete(IntPtr dirItem);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsCreateMemoryStream(ulong inSize, out IntPtr outStream);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsCreateEvfImageRef(IntPtr inStream, out IntPtr outEvfImage);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsDownloadEvfImage(IntPtr cam, IntPtr evfImage);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetLength(IntPtr inStream, out ulong outLength);
        [DllImport("EDSDK.dll")]
        public static extern uint EdsGetEvent();
        [DllImport("EDSDK.dll")]
        public static extern uint EdsRelease(IntPtr inRef);
    }
}

