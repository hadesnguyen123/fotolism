import React, { useState } from 'react'
import {
    Camera,
    Printer,
    Radio,
    Laptop,
    Check,
    RotateCcw,
    Settings,
    Grid3x3,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { BeautyCameraView } from '../../components/BeautyCameraView'
import { DEFAULT_PRINT_SCALE, CANON_DAEMON_BASE_URL } from '../../lib/constants'

type PhotoboothFrameTestKey = '2x6_4' | '4x6_4' | '4x6_9'

/**
 * Thông số 3 khung Photobooth chuẩn 600 DPI (khớp 100% Single Source of Truth tại CaptureScreen.tsx)
 * đặt trong vùng Live View cảm biến gốc 3:2.
 */
const PHOTOBOOTH_FRAME_PRESETS: Array<{
    key: PhotoboothFrameTestKey
    label: string
    w: number
    h: number
    ratioText: string
}> = [
    {
        key: '2x6_4',
        label: '2×6 (4 ảnh)',
        w: 1056,
        h: 704,
        ratioText: '3:2 • 1056×704',
    },
    {
        key: '4x6_4',
        label: '4×6 (4 ảnh)',
        w: 1088,
        h: 1452,
        ratioText: '3:4 • 1088×1452',
    },
    {
        key: '4x6_9',
        label: '4×6 (9 ảnh)',
        w: 762,
        h: 1162,
        ratioText: '2:3 • 762×1162',
    },
]

export type HardwareSubTab = 'camera' | 'printer' | 'remote'

interface AdminDevicesTabProps {
    hardwareSubTab: HardwareSubTab
    setHardwareSubTab: (tab: HardwareSubTab) => void
    daemonStatus: { running: boolean; url: string; state?: string } | null
    webcamVideoRef: React.RefObject<HTMLVideoElement | null>
    webcamStream?: MediaStream | null
    isTestingShutter: boolean
    shutterTestResult: string | null
    handleTestShutter: () => void
    printersList: Array<{ name: string; isDefault: boolean }>
    paperRollCount: number
    printFormat: '2x6' | '4x6'
    setPrintFormat: (format: '2x6' | '4x6') => void
    printDpi: string
    setPrintDpi: (dpi: string) => void
    isTestingPrint: boolean
    printTestMsg: string | null
    handleTestPrinterConnection: () => void
    handleTestPrintPage: () => void
    lastKeyPressed: string
    lastRemoteTime: string
    isRemoteSignalReceived: boolean
    handleSimulateRemote: () => void
}

export const AdminDevicesTab: React.FC<AdminDevicesTabProps> = ({
    hardwareSubTab,
    setHardwareSubTab,
    daemonStatus,
    webcamVideoRef,
    webcamStream,
    isTestingShutter,
    shutterTestResult,
    handleTestShutter,
    printersList,
    paperRollCount,
    printFormat,
    setPrintFormat,
    printDpi,
    setPrintDpi,
    isTestingPrint,
    printTestMsg,
    handleTestPrinterConnection,
    handleTestPrintPage,
    lastKeyPressed,
    lastRemoteTime,
    isRemoteSignalReceived,
    handleSimulateRemote,
}) => {
    const {
        cameraType,
        setCameraType,
        beautyEnabled,
        vLine,
        bigEyes,
        skinSmoothing,
        skinToneEvenness,
        blush,
        slimFace,
        whiteningTone,
        rosyTone,
        glowClarity,
        brightnessAdjust,
        contrastAdjust,
        saturationAdjust,
        getBeautyFilterCss,
        printScale,
        setPrintScale,
    } = useAppStore()

    const [activeFrameKey, setActiveFrameKey] =
        useState<PhotoboothFrameTestKey>('2x6_4')
    const [showAlignmentGrid, setShowAlignmentGrid] = useState<boolean>(true)

    const activePreset =
        PHOTOBOOTH_FRAME_PRESETS.find((p) => p.key === activeFrameKey) ||
        PHOTOBOOTH_FRAME_PRESETS[0]
    const slotAspect = activePreset.w / activePreset.h
    const liveAspect = 3 / 2
    const guideBoxStyle: React.CSSProperties =
        slotAspect <= liveAspect
            ? {
                  height: '100%',
                  width: `${((slotAspect / liveAspect) * 100).toFixed(4)}%`,
                  aspectRatio: `${activePreset.w} / ${activePreset.h}`,
              }
            : {
                  width: '100%',
                  height: `${((liveAspect / slotAspect) * 100).toFixed(4)}%`,
                  aspectRatio: `${activePreset.w} / ${activePreset.h}`,
              }

    const isCameraOnline = Boolean(daemonStatus?.running)

    return (
        <div className="tab-pane-content">
            {/* ── Tiêu Đề Tab & 3 Sub-tab Lớn Touch-First ── */}
            <div className="pane-header-row">
                <div className="pane-title-with-icon">
                    <Camera size={26} strokeWidth={2.4} />
                    <h2 className="tab-pane-title">
                        Quản Trị Thiết Bị Ngoại Vi
                    </h2>
                </div>

                <div className="sub-tabs-pill-group">
                    <button
                        className={`sub-tab-touch-btn ${hardwareSubTab === 'camera' ? 'active' : ''}`}
                        onClick={() => setHardwareSubTab('camera')}
                    >
                        <Camera size={20} strokeWidth={2.2} />
                        <span>Máy Ảnh</span>
                    </button>

                    <button
                        className={`sub-tab-touch-btn ${hardwareSubTab === 'printer' ? 'active' : ''}`}
                        onClick={() => setHardwareSubTab('printer')}
                    >
                        <Printer size={20} strokeWidth={2.2} />
                        <span>Máy In (DS-RX1)</span>
                    </button>

                    <button
                        className={`sub-tab-touch-btn ${hardwareSubTab === 'remote' ? 'active' : ''}`}
                        onClick={() => setHardwareSubTab('remote')}
                    >
                        <Radio size={20} strokeWidth={2.2} />
                        <span>Remote</span>
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 1: MÁY ẢNH (CANON EOS R100 & WEBCAM)
          ══════════════════════════════════════════════════════════════════ */}
            {hardwareSubTab === 'camera' && (
                <div className="hardware-camera-layout">
                    {/* 1. Chọn Nguồn Camera (Cards Lớn) */}
                    <div className="camera-source-selector-card">
                        <span className="source-section-label">
                            Nguồn Camera
                        </span>
                        <div className="source-cards-row">
                            {/* Card Canon EOS R100 */}
                            <div
                                className={`camera-source-card ${cameraType === 'eos' ? 'selected' : ''}`}
                                onClick={() => setCameraType('eos')}
                            >
                                <div className="source-card-left">
                                    <div className="source-icon-wrap">
                                        <Camera size={28} strokeWidth={2.2} />
                                    </div>
                                    <div className="source-card-text">
                                        <span className="source-card-name">
                                            Canon EOS R100
                                        </span>
                                        <span className="source-card-sub">
                                            {isCameraOnline
                                                ? 'Native EDSDK 64-bit • Cáp USB'
                                                : 'Chưa kết nối daemon 8899'}
                                        </span>
                                    </div>
                                </div>
                                {cameraType === 'eos' && (
                                    <div className="source-checked-badge">
                                        <Check size={18} strokeWidth={3} />
                                    </div>
                                )}
                            </div>

                            {/* Card Laptop / Webcam */}
                            <div
                                className={`camera-source-card ${cameraType === 'laptop' ? 'selected' : ''}`}
                                onClick={() => setCameraType('laptop')}
                            >
                                <div className="source-card-left">
                                    <div className="source-icon-wrap">
                                        <Laptop size={28} strokeWidth={2.2} />
                                    </div>
                                    <div className="source-card-text">
                                        <span className="source-card-name">
                                            Laptop / Webcam
                                        </span>
                                        <span className="source-card-sub">
                                            Webcam tích hợp hoặc USB UVC
                                        </span>
                                    </div>
                                </div>
                                {cameraType === 'laptop' && (
                                    <div className="source-checked-badge">
                                        <Check size={18} strokeWidth={3} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. Hàng Live View chuẩn 3:2 và Kiểm Tra 3 Khung Photobooth */}
                    <div className="camera-liveview-controls-grid">
                        <div className="liveview-preview-column">
                            <div className="liveview-header-bar">
                                <div className="liveview-title-group">
                                    <span className="liveview-title-text">
                                        Live View (3:2)
                                    </span>
                                    <span
                                        className={`pill-badge ${isCameraOnline || cameraType === 'laptop' ? 'pill-green' : 'pill-amber'}`}
                                    >
                                        <span
                                            className={
                                                isCameraOnline ||
                                                    cameraType === 'laptop'
                                                    ? 'badge-dot-green'
                                                    : 'badge-dot-amber'
                                            }
                                        />
                                        {cameraType === 'eos'
                                            ? 'EOS R100'
                                            : 'Webcam'}
                                    </span>
                                </div>

                                {/* 3 nút chuyển khung tỉ lệ Photobooth + Bật/tắt lưới căn tâm */}
                                <div className="admin-frame-test-bar">
                                    <div
                                        className="admin-frame-presets-group"
                                        role="group"
                                        aria-label="Chọn khung Photobooth để căn chỉnh góc máy"
                                    >
                                        {PHOTOBOOTH_FRAME_PRESETS.map(
                                            (preset) => (
                                                <button
                                                    key={preset.key}
                                                    type="button"
                                                    className={`admin-frame-preset-btn ${activeFrameKey === preset.key ? 'active' : ''}`}
                                                    onClick={() =>
                                                        setActiveFrameKey(
                                                            preset.key
                                                        )
                                                    }
                                                >
                                                    {preset.label}
                                                </button>
                                            )
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className={`admin-grid-toggle-btn ${showAlignmentGrid ? 'active' : ''}`}
                                        onClick={() =>
                                            setShowAlignmentGrid(
                                                (prev) => !prev
                                            )
                                        }
                                        title="Bật/tắt trục tâm & lưới kiểm tra nghiêng lệch"
                                    >
                                        <Grid3x3 size={16} strokeWidth={2.2} />
                                        <span>Lưới căn tâm</span>
                                    </button>

                                    <button
                                        className="btn-shutter-test-touch"
                                        onClick={handleTestShutter}
                                        disabled={isTestingShutter}
                                    >
                                        <Camera size={18} strokeWidth={2.4} />
                                        <span>
                                            {isTestingShutter
                                                ? 'Đang chụp...'
                                                : 'Chụp Thử'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Viewfinder 3:2 khớp 100% CaptureScreen + Khung cắt thực tế của 3 loại Frame */}
                            <div className="liveview-stage-backdrop">
                                <div className="liveview-viewfinder-box">
                                    {cameraType === 'eos' ? (
                                        isCameraOnline &&
                                        CANON_DAEMON_BASE_URL ? (
                                            <BeautyCameraView
                                                mjpegUrl={`${CANON_DAEMON_BASE_URL}/liveview`}
                                                mirrorCamera={true}
                                                beautyEnabled={beautyEnabled}
                                                skinSmoothing={skinSmoothing}
                                                skinToneEvenness={
                                                    skinToneEvenness
                                                }
                                                vLine={vLine}
                                                bigEyes={bigEyes}
                                                blush={blush}
                                                slimFace={slimFace}
                                                whiteningTone={whiteningTone}
                                                rosyTone={rosyTone}
                                                glowClarity={glowClarity}
                                                brightnessAdjust={
                                                    brightnessAdjust
                                                }
                                                contrastAdjust={contrastAdjust}
                                                saturationAdjust={
                                                    saturationAdjust
                                                }
                                                className="liveview-feed-media"
                                            />
                                        ) : (
                                            <div className="liveview-offline-placeholder">
                                                <Camera
                                                    size={56}
                                                    strokeWidth={1.5}
                                                    color="#8C756B"
                                                />
                                                <p>Máy ảnh Canon chưa kết nối</p>
                                                <span>
                                                    Vui lòng cắm cáp USB và bật
                                                    nguồn máy ảnh Canon EOS R100
                                                </span>
                                            </div>
                                        )
                                    ) : webcamStream ? (
                                        <BeautyCameraView
                                            stream={webcamStream}
                                            mirrorCamera={true}
                                            beautyEnabled={beautyEnabled}
                                            skinSmoothing={skinSmoothing}
                                            skinToneEvenness={skinToneEvenness}
                                            vLine={vLine}
                                            bigEyes={bigEyes}
                                            blush={blush}
                                            slimFace={slimFace}
                                            whiteningTone={whiteningTone}
                                            rosyTone={rosyTone}
                                            glowClarity={glowClarity}
                                            brightnessAdjust={brightnessAdjust}
                                            contrastAdjust={contrastAdjust}
                                            saturationAdjust={saturationAdjust}
                                            className="liveview-feed-media"
                                        />
                                    ) : (
                                        <video
                                            ref={webcamVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="liveview-feed-media"
                                            style={{
                                                transform: 'scaleX(-1)',
                                                filter: getBeautyFilterCss(),
                                            }}
                                        />
                                    )}

                                    {/* Khung giới hạn tỉ lệ thực tế (khớp 100% CaptureAspectGuide ở màn chụp) */}
                                    <div className="admin-frame-guide-overlay">
                                        <div
                                            className="admin-frame-guide-box"
                                            style={guideBoxStyle}
                                        >
                                            {showAlignmentGrid && (
                                                <div
                                                    className="admin-alignment-grid"
                                                    aria-hidden="true"
                                                >
                                                    <span className="align-third-v v1" />
                                                    <span className="align-third-v v2" />
                                                    <span className="align-third-h h1" />
                                                    <span className="align-third-h h2" />
                                                    <span className="align-center-v" />
                                                    <span className="align-center-h" />
                                                    <span className="align-center-dot" />
                                                </div>
                                            )}

                                            <div className="admin-guide-corner top-left" />
                                            <div className="admin-guide-corner top-right" />
                                            <div className="admin-guide-corner bottom-left" />
                                            <div className="admin-guide-corner bottom-right" />

                                            <div className="admin-guide-spec-pill">
                                                Khung {activePreset.label} •{' '}
                                                {activePreset.ratioText}
                                            </div>
                                        </div>
                                    </div>

                                    {/* FPS Badge */}
                                    <div className="fps-indicator-pill">
                                        <span className="live-dot-pulse" />
                                        <span>LIVE • GƯƠNG BẬT</span>
                                    </div>
                                </div>
                            </div>

                            {shutterTestResult && (
                                <div className="shutter-result-notice">
                                    {shutterTestResult}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 2: MÁY IN NHIỆT (DNP DS-RX1HS)
          ══════════════════════════════════════════════════════════════════ */}
            {hardwareSubTab === 'printer' && (
                <div className="hardware-printer-layout">
                    <div className="panel-card-touch">
                        <div className="printer-info-header">
                            <div className="printer-avatar-row">
                                <div className="printer-box-icon">
                                    <Printer size={36} strokeWidth={2} />
                                </div>
                                <div className="printer-name-group">
                                    <div className="printer-title-badge-row">
                                        <h3 className="printer-title">
                                            {printersList[0]?.name ||
                                                'DNP DS-RX1HS'}
                                        </h3>
                                        <span
                                            className={`pill-badge ${printersList.length > 0 ? 'pill-green' : 'pill-amber'}`}
                                        >
                                            <span
                                                className={
                                                    printersList.length > 0
                                                        ? 'badge-dot-green'
                                                        : 'badge-dot-amber'
                                                }
                                            />
                                            {printersList.length > 0
                                                ? 'Kết nối'
                                                : 'Chưa nhận'}
                                        </span>
                                    </div>
                                    <span className="printer-desc-sub">
                                        Dye-Sublimation Photo Printer • Spooler
                                        OK
                                    </span>
                                </div>
                            </div>

                            <div className="printer-actions-group">
                                <button
                                    className="btn-touch-outline"
                                    onClick={handleTestPrinterConnection}
                                >
                                    <Settings size={18} />
                                    <span>Kiểm Tra Kết Nối</span>
                                </button>

                                <button
                                    className="btn-touch-primary"
                                    onClick={handleTestPrintPage}
                                    disabled={isTestingPrint}
                                >
                                    <Printer size={18} />
                                    <span>
                                        {isTestingPrint
                                            ? 'Đang in...'
                                            : 'In Thử'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {printTestMsg && (
                            <div className="shutter-result-notice">
                                {printTestMsg}
                            </div>
                        )}

                        {/* Bộ cấu hình in Touch-First */}
                        <div className="printer-settings-grid">
                            <div className="form-group-touch">
                                <label className="form-label-touch">
                                    Khổ giấy
                                </label>
                                <select
                                    value={printFormat}
                                    onChange={(e) =>
                                        setPrintFormat(
                                            e.target.value as '2x6' | '4x6'
                                        )
                                    }
                                    className="form-select-touch"
                                >
                                    <option value="2x6">
                                        Dải Strip 2×6 inch
                                    </option>
                                    <option value="4x6">
                                        Bưu thiếp 4×6 inch
                                    </option>
                                </select>
                            </div>

                            <div className="form-group-touch">
                                <label className="form-label-touch">
                                    Độ phân giải
                                </label>
                                <select
                                    value={printDpi}
                                    onChange={(e) =>
                                        setPrintDpi(e.target.value)
                                    }
                                    className="form-select-touch"
                                >
                                    <option value="600 DPI">
                                        600 DPI (Chuẩn in siêu chi tiết)
                                    </option>
                                    <option value="300 DPI">
                                        300 DPI (Tương thích tiêu chuẩn)
                                    </option>
                                </select>
                            </div>
                        </div>

                        {/* Cấu hình Tỉ lệ in (Print Scale) - Bù trừ xén lẹm máy in */}
                        <div className="print-scale-card">
                            <div className="print-scale-header">
                                <div className="print-scale-title-group">
                                    <div className="print-scale-label-row">
                                        <label
                                            className="form-label-touch"
                                            style={{ margin: 0 }}
                                        >
                                            Tỉ lệ in (Print Scale)
                                        </label>
                                        <span className="print-scale-value-badge font-mono">
                                            {printScale.toFixed(2)}%
                                        </span>
                                    </div>
                                    <span className="print-scale-subtitle">
                                        Thu nhỏ ảnh để bù hiện tượng máy in phóng
                                        ảnh và xén lẹm 4 cạnh giấy (90.00% –
                                        100.00%, bước 0.25%)
                                    </span>
                                </div>
                                {printScale !== DEFAULT_PRINT_SCALE && (
                                    <button
                                        type="button"
                                        className="btn-print-scale-reset"
                                        onClick={() =>
                                            setPrintScale(DEFAULT_PRINT_SCALE)
                                        }
                                        title={`Khôi phục chuẩn DNP ${DEFAULT_PRINT_SCALE.toFixed(2)}%`}
                                    >
                                        <RotateCcw size={14} />
                                        <span>Đặt lại {DEFAULT_PRINT_SCALE.toFixed(2)}%</span>
                                    </button>
                                )}
                            </div>

                            <div className="print-scale-slider-container">
                                <input
                                    type="range"
                                    min={90}
                                    max={100}
                                    step={0.25}
                                    value={printScale}
                                    onChange={(e) =>
                                        setPrintScale(
                                            parseFloat(e.target.value)
                                        )
                                    }
                                    className="touch-range-slider print-scale-slider"
                                />
                                <div className="print-scale-ticks">
                                    <span>90.00%</span>
                                    <span>92.50%</span>
                                    <span>95.50%</span>
                                    <span>98.00%</span>
                                    <span
                                        className={
                                            printScale === 100
                                                ? 'tick-highlight'
                                                : ''
                                        }
                                    >
                                        100.00% (Chuẩn DNP)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Tiến độ vật tư in */}
                        <div className="paper-supply-card">
                            <div className="paper-supply-header">
                                <span className="paper-label">Vật tư in</span>
                                <span className="paper-stat">
                                    <strong>{paperRollCount}</strong> / 800 ảnh
                                    ({Math.round((paperRollCount / 800) * 100)}
                                    %)
                                </span>
                            </div>
                            <div className="paper-progress-bar">
                                <div
                                    className="paper-progress-fill"
                                    style={{
                                        width: `${(paperRollCount / 800) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 3: REMOTE SELFBOOTH CLICKER
          ══════════════════════════════════════════════════════════════════ */}
            {hardwareSubTab === 'remote' && (
                <div className="hardware-remote-layout">
                    <div className="panel-card-touch remote-center-card">
                        <div className="remote-status-indicator-box">
                            <div
                                className={`remote-pulse-circle ${isRemoteSignalReceived ? 'active' : ''}`}
                            >
                                <Radio size={48} strokeWidth={2.4} />
                            </div>
                            <h3 className="remote-status-title">
                                {isRemoteSignalReceived
                                    ? 'ĐÃ NHẬN TÍN HIỆU TỪ REMOTE!'
                                    : 'Đang nhận tín hiệu Remote'}
                            </h3>
                            <p className="remote-status-desc">
                                Nhấn bất kỳ nút nào trên Remote chụp không dây
                                Bluetooth hoặc bàn phím
                            </p>
                        </div>

                        <div className="remote-meta-grid">
                            <div className="remote-meta-box">
                                <span className="meta-lbl">Phím vừa nhận</span>
                                <span className="meta-val highlight">
                                    {lastKeyPressed}
                                </span>
                            </div>

                            <div className="remote-meta-box">
                                <span className="meta-lbl">Thời gian</span>
                                <span className="meta-val">
                                    {lastRemoteTime}
                                </span>
                            </div>

                            <div className="remote-meta-box">
                                <span className="meta-lbl">Phím kích hoạt</span>
                                <span className="meta-val code">
                                    Space / Enter
                                </span>
                            </div>
                        </div>

                        <div className="remote-actions-row">
                            <button
                                className="btn-touch-primary"
                                onClick={handleSimulateRemote}
                            >
                                <Radio size={18} />
                                <span>Giả lập bấm Remote</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
export default AdminDevicesTab
