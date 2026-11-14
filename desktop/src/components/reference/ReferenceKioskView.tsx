import React, { useState, useEffect } from 'react';
import './fonts.css';
import './reference.css';

const REFERENCE_ASSET_BASE = `${import.meta.env.BASE_URL}reference-ui/`;

export type ScreenId =
  | 'welcome'
  | 'select-layout'
  | 'confirm-info'
  | 'payment'
  | 'camera-booth'
  | 'frame-filter'
  | 'printing';

export interface LayoutOption {
  id: '2x6' | '4x6_4' | '4x6_9';
  title: string;
  confirmTitle: string;
  subtitle: string;
  photosPerSheet: number;
  sheetsIncluded: number;
  basePrice: number;
  extraPrice: number;
  extraStep: number;
  priceLabel: string;
  confirmPriceLabel: string;
  badgeText: string;
  svgAsset: string;
  confirmSvgAsset: string;
  starLeft: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: '2x6',
    title: 'Ảnh 2x6 ',
    confirmTitle: 'Khổ 2x6 inch ',
    subtitle: '(Gói 2 ảnh in)',
    photosPerSheet: 4,
    sheetsIncluded: 2,
    basePrice: 70000,
    extraPrice: 30000,
    extraStep: 2,
    priceLabel: '70.000',
    confirmPriceLabel: '70.000đ/ 2 tấm',
    badgeText: '4 ảnh / dải dọc',
    svgAsset: `${REFERENCE_ASSET_BASE}l_group10.svg`,
    confirmSvgAsset: `${REFERENCE_ASSET_BASE}c_group10.svg`,
    starLeft: 488.28,
  },
  {
    id: '4x6_4',
    title: '4 ảnh 2x6 ',
    confirmTitle: 'Khổ 4x6 (4 ảnh)',
    subtitle: '(Gói 2 ảnh in)',
    photosPerSheet: 4,
    sheetsIncluded: 2,
    basePrice: 90000,
    extraPrice: 30000,
    extraStep: 2,
    priceLabel: '90.000',
    confirmPriceLabel: '90.000đ/ 2 tấm',
    badgeText: '4 ảnh / lưới đôi',
    svgAsset: `${REFERENCE_ASSET_BASE}l_group11.svg`,
    confirmSvgAsset: `${REFERENCE_ASSET_BASE}l_group11.svg`,
    starLeft: 715.65,
  },
  {
    id: '4x6_9',
    title: '9 ảnh',
    confirmTitle: 'Khổ 4x6 (9 ảnh)',
    subtitle: '(Gói 1 ảnh in)',
    photosPerSheet: 9,
    sheetsIncluded: 1,
    basePrice: 90000,
    extraPrice: 30000,
    extraStep: 1,
    priceLabel: '90.000',
    confirmPriceLabel: '90.000đ/ 1 tấm',
    badgeText: '9 ảnh / lưới vuông',
    svgAsset: `${REFERENCE_ASSET_BASE}l_group12.svg`,
    confirmSvgAsset: `${REFERENCE_ASSET_BASE}l_group12.svg`,
    starLeft: 1082.97,
  },
];

export interface FrameOption {
  id: string;
  name: string;
  left: number;
  labelCenter: number;
  spriteStyle: React.CSSProperties;
  stripBg: string;
  stripBorder?: string;
  stripPattern?: string;
  logoFilter?: string;
}

export const FRAME_OPTIONS: FrameOption[] = [
  {
    id: 'black',
    name: 'Đen',
    left: 100,
    labelCenter: 142,
    spriteStyle: {
      height: '592.59%',
      left: '-1009.26%',
      top: '-216.3%',
      width: '2370.37%',
    },
    stripBg: '#121110',
    logoFilter: 'none',
  },
  {
    id: 'pastel-blue',
    name: 'Xanh pastel',
    left: 248,
    labelCenter: 290,
    spriteStyle: {
      height: '597.01%',
      left: '-1173.58%',
      top: '-218.66%',
      width: '2415.09%',
    },
    stripBg: '#d8eef8',
    stripPattern:
      'radial-gradient(circle, #79b8d9 2px, transparent 2.5px) 0 0 / 18px 18px',
    logoFilter: 'invert(1) sepia(1) saturate(3) hue-rotate(175deg) brightness(0.45)',
  },
  {
    id: 'brown-dots',
    name: 'Chấm nâu',
    left: 396,
    labelCenter: 438,
    spriteStyle: {
      height: '597.01%',
      left: '-1318.87%',
      top: '-218.66%',
      width: '2415.09%',
    },
    stripBg: '#fbf6ee',
    stripPattern:
      'radial-gradient(circle, #653125 2.2px, transparent 2.8px) 0 0 / 20px 20px',
    logoFilter: 'invert(0.8) sepia(1) saturate(4) hue-rotate(345deg) brightness(0.35)',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    left: 544,
    labelCenter: 586,
    spriteStyle: {
      height: '597.01%',
      left: '-1492.31%',
      top: '-218.66%',
      width: '2461.54%',
    },
    stripBg: '#592e20',
    stripBorder: '2px dashed rgba(246, 243, 232, 0.35)',
    logoFilter: 'none',
  },
  {
    id: 'cream',
    name: 'Kem',
    left: 692,
    labelCenter: 734,
    spriteStyle: {
      height: '597.01%',
      left: '-1638.46%',
      top: '-218.66%',
      width: '2461.54%',
    },
    stripBg: '#f6f2e6',
    stripBorder: '1px solid #e0d6c3',
    logoFilter: 'invert(0.8) sepia(1) saturate(4) hue-rotate(345deg) brightness(0.35)',
  },
  {
    id: 'navy',
    name: 'Xanh đậm',
    left: 840,
    labelCenter: 882,
    spriteStyle: {
      height: '597.01%',
      left: '-1786.54%',
      top: '-218.66%',
      width: '2461.54%',
    },
    stripBg: '#1c3a69',
    stripPattern:
      'radial-gradient(circle, #f3d060 1.8px, transparent 2.3px) 6px 6px / 28px 28px',
    logoFilter: 'none',
  },
];

export interface FilterOption {
  id: 'natural' | 'monochrome' | 'warm-brown';
  name: string;
  nodeId: string;
  labelNodeId: string;
  swatchColor: string;
  ringColor: string;
  checkColor: string;
  selectedSvg: string;
  cssFilter: string;
}

export const FILTER_OPTIONS: FilterOption[] = [
  {
    id: 'natural',
    name: 'Neutral F400',
    nodeId: '13:1734',
    labelNodeId: '0:370',
    swatchColor: '#e5d1bd',
    ringColor: '#653125',
    checkColor: '#653125',
    selectedSvg: `${REFERENCE_ASSET_BASE}f_neutral_selected.svg`,
    cssFilter: 'none',
  },
  {
    id: 'monochrome',
    name: 'Monochrome F',
    nodeId: '13:1730',
    labelNodeId: '0:373',
    swatchColor: '#262626',
    ringColor: '#151312',
    checkColor: '#f6f3e8',
    selectedSvg: `${REFERENCE_ASSET_BASE}f_mono_selected.svg`,
    cssFilter: 'grayscale(100%) contrast(1.08)',
  },
  {
    id: 'warm-brown',
    name: 'Browny F300',
    nodeId: '13:1726',
    labelNodeId: '0:376',
    swatchColor: '#96522b',
    ringColor: '#653125',
    checkColor: '#f6f3e8',
    selectedSvg: `${REFERENCE_ASSET_BASE}f_browny_selected.svg`,
    cssFilter: 'sepia(48%) saturate(135%) contrast(1.04) brightness(0.98)',
  },
];

function formatVND(amount: number, withSuffix = true): string {
  const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return withSuffix ? `${formatted}đ` : formatted;
}

export interface ReferenceThemeOption {
  id: string;
  name: string;
  overlayUrl?: string;
  bgColor?: string;
  is2x6?: boolean;
}

export interface ReferenceProps {
  screen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  values?: Record<string, unknown>;
  changes?: Record<string, (value: unknown) => void>;
  layouts?: LayoutOption[];
  themes?: ReferenceThemeOption[];
  framePreview?: React.ReactNode;
  camera?: React.ReactNode;
  qrUrl?: string;
  onCapture?: (index?: number) => void;
  onPromo?: () => void;
  onFinish?: () => void;
  status?: string;
  bank?: { name: string; holder: string; account: string; code: string };
  photoOffsets?: { x: number; y: number }[];
  onOffsets?: (offsets: { x: number; y: number }[]) => void;
  finishReady?: boolean;
  delivery?: React.ReactNode;
}
function useReferenceState<T>(props: ReferenceProps, name: string, initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [local, setLocal] = useState(initial);
  const value = (props.values && name in props.values ? props.values[name] : local) as T;
  return [value, (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    if (props.changes?.[name]) props.changes[name](resolved);
    else setLocal(resolved);
  }];
}
export default function ReferenceKioskView(props: ReferenceProps) {
  const LAYOUT_OPTIONS = props.layouts || DEFAULT_LAYOUT_OPTIONS;
  const screen = props.screen;
  const setScreen = props.onNavigate;
  const [viewport, setViewport] = useState<{
    scale: number;
    stageW: number;
    stageH: number;
  }>({
    scale: 1,
    stageW: 1920,
    stageH: 1080,
  });

  const [selectedLayoutIdx, setSelectedLayoutIdx] = useReferenceState<number>(props, "selectedLayoutIdx", 0);
  const [printCount, setPrintCount] = useReferenceState<number>(props, "printCount", 2);
  const [promoCode, setPromoCode] = useReferenceState<string>(props, "promoCode", '');
  const [appliedDiscount] = useReferenceState<number>(props, "appliedDiscount", 0);
  const [promoFeedback] = useReferenceState<string>(props, "promoFeedback", '');
  const [paymentConfirmed, setPaymentConfirmed] = useReferenceState<boolean>(props, "paymentConfirmed", false);

  // Screen 5: Camera booth state
  const [countdownSetting, setCountdownSetting] = useReferenceState<number>(props, "countdownSetting", 5);
  const [activeCountdown] = useReferenceState<number | null>(props, "activeCountdown", null);
  const [isProcessing] = useReferenceState<boolean>(props, "isProcessing", false);
  const [capturedPhotos] = useReferenceState<(string | null)[]>(props, "capturedPhotos", [
    null,
    null,
    null,
    null,
  ]);
  const [isFlashing] = useReferenceState<boolean>(props, "isFlashing", false);

  // Screen 6: Frame & Filter state
  const [selectedFrameIdx, setSelectedFrameIdx] = useReferenceState<number>(props, "selectedFrameIdx", 0);
  const [selectedFilterIdx, setSelectedFilterIdx] = useReferenceState<number>(props, "selectedFilterIdx", 0);
  const [photoOffsets, setPhotoOffsets] = useReferenceState<{ x: number; y: number }[]>(props, "photoOffsets", [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  const [draggingSlot, setDraggingSlot] = useState<{
    index: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [remainingSeconds] = useReferenceState<number>(props, "remainingSeconds", 59);

  const selectedLayout = LAYOUT_OPTIONS[selectedLayoutIdx];
  const totalCaptureSlots = selectedLayout?.photosPerSheet || 4;
  const isDarkScreen = screen === 'welcome' || screen === 'select-layout';

  // Compute adaptive full-viewport scale & virtual stage dimensions
  useEffect(() => {
    const updateViewport = () => {
      const vw = Math.max(window.innerWidth, 320);
      const vh = Math.max(window.innerHeight, 240);
      const scale = Math.min(vw / 1920, vh / 1080);
      const stageW = Math.round(vw / scale);
      const stageH = Math.round(vh / scale);
      setViewport({ scale, stageW, stageH });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const extraUnits = Math.max(
    0,
    Math.floor(
      (printCount - selectedLayout.sheetsIncluded) / selectedLayout.extraStep
    )
  );
  const rawTotal =
    selectedLayout.basePrice + extraUnits * selectedLayout.extraPrice;
  const finalTotal = Number(props.values?.finalTotal ?? Math.max(0, rawTotal - appliedDiscount));

  const handleSelectLayout = (idx: number) => {
    setSelectedLayoutIdx(idx);
    setPrintCount(LAYOUT_OPTIONS[idx].sheetsIncluded);
  };

  const handleAdjustQuantity = (delta: number) => {
    const step = selectedLayout.extraStep;
    const min = selectedLayout.sheetsIncluded;
    setPrintCount((prev) => Math.max(min, Math.min(20, prev + delta * step)));
  };

  const handleApplyPromo = () => props.onPromo?.();
  const capturedCount = capturedPhotos.filter(Boolean).length;
  const triggerCaptureSlot = (slotIdx: number) => props.onCapture?.(slotIdx);
  const handleStartShoot = () => props.onCapture?.();

  const handleSlotPointerDown = (
    index: number,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingSlot({
      index,
      startX: e.clientX,
      startY: e.clientY,
      origX: photoOffsets[index].x,
      origY: photoOffsets[index].y,
    });
  };

  const handleGlobalMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSlot) return;
    const dx = (e.clientX - draggingSlot.startX) / viewport.scale;
    const dy = (e.clientY - draggingSlot.startY) / viewport.scale;
    setPhotoOffsets((prev) => {
      const next = [...prev];
      next[draggingSlot.index] = {
        x: Math.max(-45, Math.min(45, draggingSlot.origX + dx)),
        y: Math.max(-35, Math.min(35, draggingSlot.origY + dy)),
      };
      return next;
    });
  };

  const handleGlobalMouseUp = () => {
    if (draggingSlot) setDraggingSlot(null);
  };

  const formattedTimer = `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}s`;
  const activeFrame = FRAME_OPTIONS[selectedFrameIdx];
  const activeFilter = FILTER_OPTIONS[selectedFilterIdx];

  return (
    <div
      className={`reference-kiosk fotolism-viewport ${isDarkScreen ? 'theme-dark' : 'theme-light'}`}
      onPointerMove={handleGlobalMouseMove}
      onPointerUp={handleGlobalMouseUp}
      onPointerCancel={handleGlobalMouseUp}
    >
      {/* SVG Filter for Hand-Drawn Fotolism Brush Borders (--brushstyle) */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="fotolism-brush-stroke"
            x="-4%"
            y="-4%"
            width="108%"
            height="108%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.08"
              numOctaves="3"
              seed="7"
              result="brushNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="brushNoise"
              scale="2.1"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Fullscreen Paper Grit Texture for Dark Screens */}
      {isDarkScreen && (
        <div className="viewport-paper-grit" data-node-id="0:79">
          <img
            alt=""
            src={
              screen === 'welcome'
                ? `${REFERENCE_ASSET_BASE}ap_paper_grit.png`
                : `${REFERENCE_ASSET_BASE}l_paper_grit.png`
            }
          />
        </div>
      )}

      {/* Adaptive Stage filling 100% of the browser aspect ratio */}
      <div
        className="fotolism-stage"
        style={{
          width: viewport.stageW,
          height: viewport.stageH,
          transform: `translate(-50%, -50%) scale(${viewport.scale})`,
        }}
      >
        {/* ============================================================
            SCREEN 1: WELCOME (node-id="0:77")
        ============================================================ */}
        {screen === 'welcome' && (
          <div
            className="screen-canvas-center"
            data-node-id="0:77"
            data-name="Welcome"
          >
            <div
              className="welcome-hero-group"
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                top: 184.05,
                width: 1311.126,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              data-node-id="0:80"
            >
              <div
                style={{
                  position: 'relative',
                  width: 1311.126,
                  height: 657.074,
                  marginBottom: -26,
                  flexShrink: 0,
                }}
                data-node-id="0:81"
              >
                {/* Brand Lockup */}
                <div
                  style={{
                    position: 'absolute',
                    left: 276.25,
                    top: 79.28,
                    width: 745.313,
                    height: 347.437,
                    color: '#f6f3e8',
                  }}
                  data-node-id="0:82"
                >
                  <p
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 732.014,
                      height: 336.754,
                      fontFamily: 'var(--font-script)',
                      fontSize: 269.298,
                      lineHeight: 'normal',
                      fontWeight: 400,
                    }}
                    data-node-id="0:83"
                  >
                    fotolism
                  </p>
                  <p
                    style={{
                      position: 'absolute',
                      left: 251.71,
                      top: 254.83,
                      width: 493.6,
                      height: 92.607,
                      fontFamily: 'var(--font-serif)',
                      fontSize: 62.299,
                      letterSpacing: '-4.3609px',
                      lineHeight: 'normal',
                      fontWeight: 400,
                    }}
                    data-node-id="0:84"
                  >
                    made of moments
                  </p>
                </div>

                {/* 4 Hand-drawn blue stars with playful wiggle ("rung rinh") on hover */}
                <div
                  className="welcome-star-hitbox"
                  style={{
                    position: 'absolute',
                    left: 1119.82,
                    top: 79.28,
                    width: 68.398,
                    height: 57.437,
                  }}
                  data-node-id="0:85"
                >
                  <div className="welcome-star-anim">
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}w_vector0.svg`}
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                      }}
                    />
                  </div>
                </div>

                <div
                  className="welcome-star-hitbox"
                  style={{
                    position: 'absolute',
                    left: 131.55,
                    top: 0,
                    width: 94.407,
                    height: 79.277,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="0:86"
                >
                  {/* Static transform wrapper kept separate from animated wiggle child */}
                  <div style={{ transform: 'scaleY(-1) rotate(180deg)' }}>
                    <div className="welcome-star-anim welcome-star-delay-1">
                      <img
                        alt=""
                        src={`${REFERENCE_ASSET_BASE}w_vector1.svg`}
                        style={{
                          width: 94.407,
                          height: 79.277,
                          display: 'block',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="welcome-star-hitbox"
                  style={{
                    position: 'absolute',
                    left: 1021.57,
                    top: 388.52,
                    width: 289.561,
                    height: 268.55,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="0:87"
                >
                  <div style={{ transform: 'scaleY(-1) rotate(-158.37deg)' }}>
                    <div className="welcome-star-anim welcome-star-delay-2">
                      <img
                        alt=""
                        src={`${REFERENCE_ASSET_BASE}w_vector2.svg`}
                        style={{
                          width: 233.685,
                          height: 196.234,
                          display: 'block',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="welcome-star-hitbox"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 380.41,
                    width: 158.355,
                    height: 142.388,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="0:88"
                >
                  <div style={{ transform: 'scaleY(-1) rotate(166.36deg)' }}>
                    <div className="welcome-star-anim welcome-star-delay-3">
                      <img
                        alt=""
                        src={`${REFERENCE_ASSET_BASE}w_vector3.svg`}
                        style={{
                          width: 135.369,
                          height: 113.675,
                          display: 'block',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Button · Fotolism ("bắt đầu thui") */}
              <div
                className="interactive-btn"
                onClick={() => setScreen('select-layout')}
                style={{
                  position: 'relative',
                  width: 320,
                  height: 118.721,
                  flexShrink: 0,
                }}
                data-node-id="0:89"
                role="button"
                tabIndex={0}
              >
                <p
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: 30.02,
                    width: 320,
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 400,
                    fontSize: 40.938,
                    letterSpacing: '-2.8657px',
                    lineHeight: 'normal',
                    color: '#f6f3e8',
                    textAlign: 'center',
                  }}
                  data-node-id="I0:89;197:3241"
                >
                  bắt đầu thui
                </p>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: 323.525,
                    height: 129.671,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="I0:89;197:3242"
                >
                  <div style={{ transform: 'rotate(-4.89deg)' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: 315.884,
                        height: 103.116,
                      }}
                    >
                      <img
                        alt=""
                        src={`${REFERENCE_ASSET_BASE}w_ellipse2.svg`}
                        style={{
                          position: 'absolute',
                          inset: '-1.93% -0.63% -1.93% -0.65%',
                          width: '101.28%',
                          height: '103.86%',
                          display: 'block',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SCREEN 2: SELECT LAYOUT (node-id="0:165")
        ============================================================ */}
        {screen === 'select-layout' && (
          <>
            {/* Adaptive Top Header */}
            <div className="header-bar-adaptive" data-node-id="0:237">
              <div
                className="brand-logo"
                onClick={() => setScreen('welcome')}
                data-node-id="0:238"
              >
                <img alt="Fotolism" src={`${REFERENCE_ASSET_BASE}l_group1.svg`} />
              </div>

              <div
                style={{
                  width: 606,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  alignItems: 'center',
                  color: '#f6f3e8',
                  flexShrink: 0,
                }}
                data-node-id="0:247"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 600,
                    fontSize: 56,
                    letterSpacing: '-3.92px',
                    lineHeight: 'normal',
                    width: '100%',
                    textAlign: 'center',
                  }}
                  data-node-id="0:248"
                >
                  Mời bạn chọn layout ảnh
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: 24,
                    lineHeight: 'normal',
                    width: '100%',
                    textAlign: 'center',
                  }}
                  data-node-id="0:249"
                >
                  Layout nào cũng đẹp, mời bạn chụp thử nhen
                </p>
              </div>

              <div className="timer-shell" data-node-id="0:250">
                <div className="timer-oval-img" data-node-id="0:251">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}l_ellipse4.svg`} />
                </div>
                <p
                  className="timer-text"
                  style={{ color: '#f6f3e8' }}
                  data-node-id="0:252"
                >
                  {formattedTimer}
                </p>
              </div>
            </div>

            {/* Centered 1920x1080 Design Canvas */}
            <div
              className="screen-canvas-center"
              data-node-id="0:165"
              data-name="Layout"
            >
              {/* Option 1: Ảnh 2x6 */}
              <div
                className="interactive-card"
                onClick={() => handleSelectLayout(0)}
                style={{
                  position: 'absolute',
                  left: 522.57,
                  top: 330.2,
                  width: 139.951,
                  height: 419.863,
                }}
                data-node-id="0:168"
              >
                <img
                  alt="Ảnh 2x6"
                  src={`${REFERENCE_ASSET_BASE}l_group10.svg`}
                  style={{
                    position: 'absolute',
                    inset: '-0.4% -1.15% -0.42% -1.58%',
                    width: '102.73%',
                    height: '100.82%',
                    display: 'block',
                  }}
                />
              </div>

              {/* Option 2: 4 ảnh 2x6 */}
              <div
                className="interactive-card"
                onClick={() => handleSelectLayout(1)}
                style={{
                  position: 'absolute',
                  left: 749.94,
                  top: 330.2,
                  width: 279.903,
                  height: 419.854,
                }}
                data-node-id="0:182"
              >
                <img
                  alt="4 ảnh 2x6"
                  src={`${REFERENCE_ASSET_BASE}l_group11.svg`}
                  style={{
                    position: 'absolute',
                    inset: '-0.4% -0.57% -0.42% -0.79%',
                    width: '101.36%',
                    height: '100.82%',
                    display: 'block',
                  }}
                />
              </div>

              {/* Option 3: 9 ảnh */}
              <div
                className="interactive-card"
                onClick={() => handleSelectLayout(2)}
                style={{
                  position: 'absolute',
                  left: 1117.26,
                  top: 330.2,
                  width: 279.903,
                  height: 419.854,
                }}
                data-node-id="0:196"
              >
                <img
                  alt="9 ảnh"
                  src={`${REFERENCE_ASSET_BASE}l_group12.svg`}
                  style={{
                    position: 'absolute',
                    inset: '-0.34% -0.48% -0.35% -0.66%',
                    width: '101.14%',
                    height: '100.69%',
                    display: 'block',
                  }}
                />
              </div>

              {/* Active Star Checkmark Badge */}
              <div
                style={{
                  position: 'absolute',
                  left: selectedLayout.starLeft,
                  top: 291,
                  width: 68.586,
                  height: 68.586,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'left 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
                  pointerEvents: 'none',
                }}
                data-node-id="0:253"
              >
                <div style={{ transform: 'rotate(-15deg)' }}>
                  <img
                    alt=""
                    src={`${REFERENCE_ASSET_BASE}l_frame6.svg`}
                    style={{ width: 56, height: 56, display: 'block' }}
                  />
                </div>
              </div>

              {/* Labels & Price Badges */}
              <p
                onClick={() => handleSelectLayout(0)}
                style={{
                  position: 'absolute',
                  left: 592.55,
                  top: 760.96,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  fontSize: 24,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:231"
              >
                Ảnh 2x6{' '}
              </p>
              <p
                onClick={() => handleSelectLayout(0)}
                style={{
                  position: 'absolute',
                  left: 595.28,
                  top: 793.46,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: 20,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:232"
              >
                (Gói 2 ảnh in)
              </p>
              <div
                className="interactive-btn"
                onClick={() => handleSelectLayout(0)}
                style={{
                  position: 'absolute',
                  left: 520.28,
                  top: 826.84,
                  width: 150,
                  height: 50,
                  background: '#88c9e3',
                  border: '5px solid #88c9e3',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                data-node-id="0:256"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 32,
                    color: '#151312',
                  }}
                  data-node-id="0:257"
                >
                  {LAYOUT_OPTIONS[0].priceLabel}
                </p>
              </div>

              <p
                onClick={() => handleSelectLayout(1)}
                style={{
                  position: 'absolute',
                  left: 889.89,
                  top: 760.96,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  fontSize: 24,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:233"
              >
                4 ảnh 2x6{' '}
              </p>
              <p
                onClick={() => handleSelectLayout(1)}
                style={{
                  position: 'absolute',
                  left: 889.89,
                  top: 793.46,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: 20,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:235"
              >
                (Gói 2 ảnh in)
              </p>
              <div
                className="interactive-btn"
                onClick={() => handleSelectLayout(1)}
                style={{
                  position: 'absolute',
                  left: 814.89,
                  top: 826.84,
                  width: 150,
                  height: 50,
                  background: '#88c9e3',
                  border: '5px solid #88c9e3',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                data-node-id="0:263"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 32,
                    color: '#151312',
                  }}
                  data-node-id="0:264"
                >
                  {LAYOUT_OPTIONS[1].priceLabel}
                </p>
              </div>

              <p
                onClick={() => handleSelectLayout(2)}
                style={{
                  position: 'absolute',
                  left: 1257.21,
                  top: 760.96,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  fontSize: 24,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:234"
              >
                9 ảnh
              </p>
              <p
                onClick={() => handleSelectLayout(2)}
                style={{
                  position: 'absolute',
                  left: 1196.21,
                  top: 793.46,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: 20,
                  color: '#f6f3e8',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                data-node-id="0:236"
              >
                (Gói 1 ảnh in)
              </p>
              <div
                className="interactive-btn"
                onClick={() => handleSelectLayout(2)}
                style={{
                  position: 'absolute',
                  left: 1182.21,
                  top: 826.84,
                  width: 150,
                  height: 50,
                  background: '#88c9e3',
                  border: '5px solid #88c9e3',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                data-node-id="0:265"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 32,
                    color: '#151312',
                  }}
                  data-node-id="0:266"
                >
                  {LAYOUT_OPTIONS[2].priceLabel}
                </p>
              </div>
            </div>

            {/* Adaptive Bottom Navigation */}
            <div className="bottom-bar-adaptive">
              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('welcome')}
                data-node-id="0:225"
              >
                <div className="nav-pill-oval" data-node-id="0:226">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}l_ellipse2.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#f6f3e8' }}
                  data-node-id="0:227"
                >
                  quay lại
                </span>
              </button>

              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('confirm-info')}
                data-node-id="0:228"
              >
                <div className="nav-pill-oval" data-node-id="0:229">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}l_ellipse3.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#4d140d' }}
                  data-node-id="0:230"
                >
                  tiếp tục
                </span>
              </button>
            </div>
          </>
        )}

        {/* ============================================================
            SCREEN 3: CONFIRM PRINT INFO (node-id="0:90")
        ============================================================ */}
        {screen === 'confirm-info' && (
          <>
            <div className="header-bar-adaptive" data-node-id="0:149">
              <div
                className="brand-logo"
                onClick={() => setScreen('welcome')}
                data-node-id="0:150"
              >
                <img alt="Fotolism" src={`${REFERENCE_ASSET_BASE}c_group1.svg`} />
              </div>

              <div
                style={{
                  width: 960,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  alignItems: 'center',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
                data-node-id="0:159"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 600,
                    fontSize: 56,
                    letterSpacing: '-3.92px',
                    lineHeight: 'normal',
                    color: '#653125',
                    width: '100%',
                  }}
                  data-node-id="0:160"
                >
                  Mời bạn kiểm tra thông tin
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: 26,
                    lineHeight: 1.4,
                    color: '#785c4f',
                    width: '100%',
                  }}
                  data-node-id="0:161"
                >
                  Xem lại layout và số bản in trước khi tiếp tục.
                </p>
              </div>

              <div className="timer-shell" data-node-id="0:162">
                <div className="timer-oval-img" data-node-id="0:163">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}c_ellipse4.svg`} />
                </div>
                <p
                  className="timer-text"
                  style={{ color: '#653125' }}
                  data-node-id="0:164"
                >
                  {formattedTimer}
                </p>
              </div>
            </div>

            <div
              className="screen-canvas-center"
              data-node-id="0:90"
              data-name="Layout"
            >
              {/* Left Card: Selected Layout (Box Variant2 - 13:1499) */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 336,
                  top: 360,
                  width: 576,
                  height: 457,
                  background: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0px 4px 20px -4px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
                data-node-id="13:1499"
              >
                <div
                  style={{
                    position: 'absolute',
                    left: selectedLayout.id === '2x6' ? 111.55 : 58,
                    top: 61.48,
                    width: selectedLayout.id === '2x6' ? 109.343 : 190,
                    height: 328.037,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="13:1471"
                >
                  <img
                    alt=""
                    src={selectedLayout.confirmSvgAsset}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      filter:
                        selectedLayout.id === '2x6'
                          ? 'none'
                          : 'invert(0.78) sepia(1) saturate(3.5) hue-rotate(340deg) brightness(0.35)',
                    }}
                  />
                </div>

                <div
                  style={{
                    position: 'absolute',
                    left: 266.45,
                    top: 136.38,
                    width: 260,
                    height: 152,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                    alignItems: 'flex-start',
                  }}
                  data-node-id="13:1485"
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      width: '100%',
                    }}
                    data-node-id="13:1486"
                  >
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: 20,
                        color: '#151312',
                      }}
                      data-node-id="13:1487"
                    >
                      Layout đã chọn
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        fontSize: 32,
                        color: '#653125',
                      }}
                      data-node-id="13:1488"
                    >
                      {selectedLayout.confirmTitle}
                    </p>
                  </div>

                  <div
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    data-node-id="13:1489"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}c_camera.svg`}
                      style={{ width: 24, height: 24 }}
                      data-node-id="0:119"
                    />
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        fontSize: 20,
                        color: '#653125',
                      }}
                      data-node-id="13:1491"
                    >
                      {selectedLayout.photosPerSheet} ảnh/ tấm
                    </p>
                  </div>

                  <div
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    data-node-id="13:1492"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}c_tag.svg`}
                      style={{ width: 24, height: 24 }}
                      data-node-id="0:124"
                    />
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        fontSize: 20,
                        color: '#653125',
                      }}
                      data-node-id="13:1494"
                    >
                      {selectedLayout.confirmPriceLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Card: Print Quantity & Promo Code (Box Variant3 - 13:1609) */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 961.89,
                  top: 360,
                  width: 576,
                  height: 457,
                  background: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0px 4px 20px -4px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
                data-node-id="13:1609"
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 36.94,
                    top: 63.27,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                  data-node-id="13:1586"
                >
                  <img
                    alt=""
                    src={`${REFERENCE_ASSET_BASE}c_print.svg`}
                    style={{ width: 24, height: 24 }}
                    data-node-id="0:129"
                  />
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      fontSize: 20,
                      color: '#653125',
                    }}
                    data-node-id="13:1588"
                  >
                    Số bản in
                  </p>
                </div>

                <div
                  className="brush-border-brown"
                  style={{
                    position: 'absolute',
                    left: 303.41,
                    top: 43.27,
                    width: 215,
                    height: 64,
                    background: '#fdf5ed',
                    borderRadius: 12,
                    color: '#653125',
                  }}
                  data-node-id="13:1589"
                >
                  <button
                    type="button"
                    onClick={() => handleAdjustQuantity(-1)}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 62,
                      height: 56,
                      background: 'transparent',
                      border: 'none',
                      fontFamily: 'var(--font-inter)',
                      fontSize: 32,
                      color: '#653125',
                      cursor: 'pointer',
                    }}
                    data-node-id="13:1590"
                  >
                    −
                  </button>
                  <p
                    style={{
                      position: 'absolute',
                      left: 58,
                      top: 7,
                      width: 91,
                      textAlign: 'center',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      fontSize: 30,
                      lineHeight: 1.4,
                      color: '#653125',
                    }}
                    data-node-id="13:1591"
                  >
                    {printCount}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAdjustQuantity(1)}
                    style={{
                      position: 'absolute',
                      left: 149,
                      top: 0,
                      width: 62,
                      height: 56,
                      background: 'transparent',
                      border: 'none',
                      fontFamily: 'var(--font-inter)',
                      fontSize: 32,
                      color: '#653125',
                      cursor: 'pointer',
                    }}
                    data-node-id="13:1592"
                  >
                    +
                  </button>
                </div>

                <p
                  style={{
                    position: 'absolute',
                    left: 452.94,
                    top: 115.89,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 20,
                    lineHeight: 1.4,
                    color: '#785c4f',
                  }}
                  data-node-id="13:1593"
                >
                  tấm
                </p>

                <p
                  style={{
                    position: 'absolute',
                    left: 36.94,
                    top: 138.08,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 24,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1597"
                >
                  Mã giảm giá
                </p>

                <div
                  className="brush-border-tan"
                  style={{
                    position: 'absolute',
                    left: 36.94,
                    top: 202.89,
                    width: 330,
                    height: 64,
                    background: '#ffffff',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                  data-node-id="13:1598"
                >
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                    placeholder="Nhập mã giảm giá"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      padding: '0 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 22,
                      color: '#653125',
                      background: 'transparent',
                    }}
                    data-node-id="13:1599"
                  />
                </div>

                <button
                  type="button"
                  className="interactive-btn"
                  onClick={handleApplyPromo}
                  style={{
                    position: 'absolute',
                    left: 366.94,
                    top: 173.89,
                    width: 206,
                    height: 112.364,
                    borderRadius: 104.873,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="13:1600"
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 174.167,
                      height: 56.854,
                      transform: 'translate(-50%, -50%)',
                    }}
                    data-node-id="13:1601"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}c_apply_oval.svg`}
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      position: 'relative',
                      fontFamily: 'var(--font-serif)',
                      fontWeight: 400,
                      fontSize: 24,
                      letterSpacing: '-1.68px',
                      color: '#f7f8e0',
                      whiteSpace: 'nowrap',
                    }}
                    data-node-id="13:1602"
                  >
                    Áp dụng
                  </span>
                </button>

                {promoFeedback && (
                  <p
                    style={{
                      position: 'absolute',
                      left: 36.94,
                      top: 273,
                      fontSize: 15,
                      fontWeight: 500,
                      color: '#146e40',
                    }}
                  >
                    ✓ {promoFeedback}
                  </p>
                )}

                <div
                  style={{
                    position: 'absolute',
                    left: 36.94,
                    top: 306.89,
                    width: 496,
                    height: 1,
                    background: '#e5d9cf',
                  }}
                  data-node-id="13:1594"
                />

                <p
                  style={{
                    position: 'absolute',
                    left: 36.94,
                    top: 338.89,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 26,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1595"
                >
                  Tổng thanh toán
                </p>

                <p
                  style={{
                    position: 'absolute',
                    right: 37,
                    top: 329.89,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 40,
                    lineHeight: 1.4,
                    color: '#653125',
                    textAlign: 'right',
                  }}
                  data-node-id="13:1596"
                >
                  {formatVND(finalTotal)}
                </p>
              </div>
            </div>

            <div className="bottom-bar-adaptive" data-node-id="0:92">
              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('select-layout')}
                data-node-id="0:93"
              >
                <div className="nav-pill-oval" data-node-id="0:94">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}c_ellipse2.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#653125' }}
                  data-node-id="0:95"
                >
                  quay lại
                </span>
              </button>

              <div
                className="brush-border-soft-brown"
                style={{
                  position: 'relative',
                  width: 650,
                  height: 60,
                  background: '#fcddc0',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                data-node-id="0:258"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: '#151312',
                  }}
                  data-node-id="0:259"
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      fontSize: 24.3,
                    }}
                    data-node-id="0:260"
                  >
                    Giá in thêm
                  </span>
                  <span
                    style={{
                      width: 2,
                      height: 24.3,
                      background: '#653125',
                      display: 'inline-block',
                    }}
                    data-node-id="0:261"
                  />
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 19.44,
                      color: '#151312',
                    }}
                    data-node-id="0:262"
                  >
                    <span style={{ fontWeight: 400 }}>Khổ 2x6:</span>
                    <span style={{ fontWeight: 600 }}>{` + ${formatVND(LAYOUT_OPTIONS[0].extraPrice)}/ 2 tấm •  `}</span>
                    <span style={{ fontWeight: 400 }}>Khổ 4x6:</span>
                    <span style={{ fontWeight: 600 }}>{` + ${formatVND(LAYOUT_OPTIONS[1].extraPrice)}/ 1 tấm`}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('payment')}
                data-node-id="0:96"
              >
                <div className="nav-pill-oval" data-node-id="0:97">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}c_ellipse3.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#f7f8e0' }}
                  data-node-id="0:98"
                >
                  tiếp tục
                </span>
              </button>
            </div>
          </>
        )}

        {/* ============================================================
            SCREEN 4: PAYMENT (node-id="0:291")
        ============================================================ */}
        {screen === 'payment' && (
          <>
            <div className="header-bar-adaptive" data-node-id="0:315">
              <div
                className="brand-logo"
                onClick={() => setScreen('welcome')}
                data-node-id="0:316"
              >
                <img alt="Fotolism" src={`${REFERENCE_ASSET_BASE}p_group1.svg`} />
              </div>

              <div
                style={{
                  width: 960,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  alignItems: 'center',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
                data-node-id="0:325"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 600,
                    fontSize: 56,
                    letterSpacing: '-3.92px',
                    lineHeight: 'normal',
                    color: '#653125',
                    width: '100%',
                  }}
                  data-node-id="0:326"
                >
                  Mời bạn thanh toán
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: 23,
                    lineHeight: 1.4,
                    color: '#785c4f',
                    width: '100%',
                  }}
                  data-node-id="0:327"
                >
                  Vui lòng chuyển đúng số tiền giúp chúng mình nhé
                </p>
              </div>

              <div className="timer-shell" data-node-id="0:328">
                <div className="timer-oval-img" data-node-id="0:329">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}p_ellipse4.svg`} />
                </div>
                <p
                  className="timer-text"
                  style={{ color: '#653125' }}
                  data-node-id="0:330"
                >
                  {formattedTimer}
                </p>
              </div>
            </div>

            <div
              className="screen-canvas-center"
              data-node-id="0:291"
              data-name="Thanh toán"
            >
              {/* Left Card: QR Code (Box Variant4 - 13:1654) */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 352.28,
                  top: 360,
                  width: 576,
                  height: 457,
                  background: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0px 4px 20px -4px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
                data-node-id="13:1654"
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 105.38,
                    top: 33,
                    width: 360,
                    height: 360,
                    overflow: 'hidden',
                  }}
                  data-node-id="13:1635"
                >
                  {props.qrUrl && (
                    <img
                      alt="Mã QR thanh toán"
                      src={props.qrUrl}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  )}
                </div>
                <p
                  style={{
                    position: 'absolute',
                    left: 285.38,
                    transform: 'translateX(-50%)',
                    top: 408,
                    width: 512,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: '#785c4f',
                    textAlign: 'center',
                  }}
                  data-node-id="13:1636"
                >
                  Mở ứng dụng ngân hàng để quét mã
                </p>
              </div>

              {/* Right Card: Bank Transfer Details (Box Variant5 - 13:1657) */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 976.28,
                  top: 360,
                  width: 576,
                  height: 457,
                  background: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0px 4px 20px -4px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
                data-node-id="13:1657"
              >
                <p
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 31,
                    width: 496,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 28,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1638"
                >
                  {props.bank?.name || ''}
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 99,
                    width: 184,
                    fontFamily: 'var(--font-inter)',
                    fontSize: 23,
                    lineHeight: 1.4,
                    color: '#785c4f',
                  }}
                  data-node-id="13:1639"
                >
                  Chủ tài khoản
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 223.38,
                    top: 99,
                    width: 310,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 25,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1640"
                >
                  {props.bank?.holder || ''}
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 148,
                    width: 184,
                    fontFamily: 'var(--font-inter)',
                    fontSize: 23,
                    lineHeight: 1.4,
                    color: '#785c4f',
                  }}
                  data-node-id="13:1641"
                >
                  Số tài khoản
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 223.38,
                    top: 148,
                    width: 310,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 25,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1642"
                >
                  {props.bank?.account || ''}
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 197,
                    width: 184,
                    fontFamily: 'var(--font-inter)',
                    fontSize: 23,
                    lineHeight: 1.4,
                    color: '#785c4f',
                  }}
                  data-node-id="13:1643"
                >
                  Nội dung CK
                </p>
                <p
                  style={{
                    position: 'absolute',
                    left: 223.38,
                    top: 197,
                    width: 310,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 25,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1644"
                >
                  {props.bank?.code || ''}
                </p>
                <div
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 255,
                    width: 496,
                    height: 1,
                    background: '#e5d9cf',
                  }}
                  data-node-id="13:1645"
                />
                <p
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 280,
                    width: 200,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 25,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="13:1646"
                >
                  Số tiền
                </p>
                <p
                  style={{
                    position: 'absolute',
                    right: 36.62,
                    top: 267,
                    width: 286,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    fontSize: 40,
                    lineHeight: 1.4,
                    color: '#653125',
                    textAlign: 'right',
                  }}
                  data-node-id="13:1647"
                >
                  {formatVND(finalTotal)}
                </p>

                <div
                  className="brush-border-black"
                  onClick={() => setPaymentConfirmed((v) => !v)}
                  style={{
                    position: 'absolute',
                    left: 37.38,
                    top: 359,
                    width: 496,
                    height: 64,
                    background: paymentConfirmed ? '#dcf3e4' : '#f0f7f0',
                    borderRadius: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 19.5,
                  }}
                  data-node-id="13:1648"
                  title="Chạm để giả lập xác nhận thanh toán"
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      fontSize: 25,
                      lineHeight: 1.4,
                      color: '#146e40',
                    }}
                    data-node-id="13:1649"
                  >
                    {paymentConfirmed
                      ? 'Đã nhận thanh toán ✓ (Bấm tiếp tục)'
                      : 'Chờ thanh toán…'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bottom-bar-adaptive">
              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('confirm-info')}
                data-node-id="0:309"
              >
                <div className="nav-pill-oval" data-node-id="0:310">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}p_ellipse2.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#653125' }}
                  data-node-id="0:311"
                >
                  quay lại
                </span>
              </button>

              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('camera-booth')}
                data-node-id="0:312"
              >
                <div className="nav-pill-oval" data-node-id="0:313">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}p_ellipse3.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#f7f8e0' }}
                  data-node-id="0:314"
                >
                  tiếp tục
                </span>
              </button>
            </div>
          </>
        )}

        {/* ============================================================
            SCREEN 5: CAMERA BOOTH (node-id="0:267")
        ============================================================ */}
        {screen === 'camera-booth' && (
          <>
            {/* Adaptive Top Header Bar: 8s/5s selector (left) + Countdown Timer (right) */}
            <div className="header-bar-adaptive" data-node-id="0:268-header">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 5,
                  borderRadius: 999,
                  background: '#fdf5ed',
                  border: '1.5px solid #e5d9cf',
                  boxShadow: '0 4px 12px rgba(64, 33, 20, 0.08)',
                  opacity: capturedCount > 0 || activeCountdown !== null ? 0.55 : 1,
                }}
                aria-label="Chọn thời gian đếm ngược chụp ảnh"
              >
                {[8, 5].map((sec) => {
                  const isActive = countdownSetting === sec;
                  const isLocked = capturedCount > 0 || activeCountdown !== null;
                  return (
                    <button
                      key={sec}
                      type="button"
                      disabled={isLocked}
                      onClick={() => !isLocked && setCountdownSetting(sec)}
                      style={{
                        minWidth: 68,
                        height: 44,
                        padding: '0 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: isActive ? '#653125' : 'transparent',
                        color: isActive ? '#fdf5ed' : '#653125',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        fontSize: 18,
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        transition: 'background 0.16s ease, color 0.16s ease',
                      }}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>

              <div className="timer-shell" data-node-id="0:269">
                <div className="timer-oval-img" data-node-id="0:270">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}s_ellipse2.svg`} />
                </div>
                <p
                  className="timer-text"
                  style={{ color: '#653125' }}
                  data-node-id="0:271"
                >
                  {formattedTimer}
                </p>
              </div>
            </div>

            <div
              className="screen-canvas-center"
              data-node-id="0:267"
              data-name="Chụp ảnh · Sẵn sàng"
            >
              {/* Left/Main Camera Column */}
              <div
                style={{
                  position: 'absolute',
                  left: 133.28,
                  top: 0,
                  width: 1400,
                  height: 1080,
                  paddingTop: 110,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                data-node-id="0:268"
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 28,
                    alignItems: 'center',
                    width: '100%',
                  }}
                  data-node-id="0:272"
                >
                  <div
                    onClick={handleStartShoot}
                    style={{
                      position: 'relative',
                      width: 1170,
                      aspectRatio: '3 / 2',
                      height: 'auto',
                      borderRadius: 19.449,
                      border: '1.216px solid #e5d9cf',
                      boxShadow: '0px 17.018px 29.174px 0px rgba(64,33,20,0.12)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                    data-node-id="0:273"
                    data-name="Camera"
                  >
                  {props.camera}
                  {activeCountdown !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(21, 19, 18, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fdf5ed',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: 180,
                          fontWeight: 600,
                          opacity: 0.6,
                          textShadow: '0 8px 32px rgba(0,0,0,0.45)',
                        }}
                      >
                        {activeCountdown}
                      </span>
                    </div>
                  )}

                  {isFlashing && <div className="camera-flash-overlay" />}
                </div>

                <button
                  type="button"
                  className="interactive-btn"
                  disabled={isProcessing}
                  onClick={handleStartShoot}
                  style={{
                    position: 'relative',
                    width: 378,
                    height: 58.5,
                    background: '#653125',
                    borderRadius: 33,
                    border: 'none',
                    boxShadow: '0px 7.5px 15px 0px rgba(64,33,20,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: isProcessing ? 'wait' : 'pointer',
                    opacity: isProcessing ? 0.72 : 1,
                  }}
                  data-node-id="0:276"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    data-node-id="0:277"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}s_camera_icon.svg`}
                      style={{ width: 30, height: 30 }}
                      data-node-id="0:278"
                    />
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        fontSize: 18,
                        lineHeight: 1.3,
                        color: '#fdf5ed',
                        textAlign: 'center',
                      }}
                      data-node-id="0:279"
                    >
                      {isProcessing
                        ? 'Đang xử lý ảnh AI...'
                        : capturedCount < totalCaptureSlots
                          ? `Bắt đầu chụp (Ảnh ${capturedCount + 1} / ${totalCaptureSlots})`
                          : 'Tiếp tục chọn Frame & Filter →'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Right Sidebar: Photo Strip (node-id="0:280") */}
            <div
              style={{
                position: 'absolute',
                left: 1552.28,
                top: 206.12,
                width: 281,
                height: 600,
              }}
              data-node-id="0:280"
            >
              <div
                style={{
                  position: 'relative',
                  width: 281,
                  height: 600,
                }}
                data-node-id="0:290"
              >
                <p
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: 0,
                    width: 280,
                    fontFamily: 'var(--font-serif)',
                    fontSize: 30,
                    letterSpacing: '-2.1px',
                    color: '#653125',
                    textAlign: 'center',
                  }}
                  data-node-id="I0:290;180:9"
                >
                  Dải ảnh của bạn
                </p>

                {totalCaptureSlots === 9 ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 16,
                      top: 76,
                      width: 249,
                      height: 374,
                      padding: 12,
                      borderRadius: 12,
                      background: '#653125',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gridTemplateRows: 'repeat(3, 1fr)',
                      gap: 8,
                    }}
                  >
                    {Array.from({ length: 9 }, (_, slotIdx) => {
                      const isCaptured = Boolean(capturedPhotos[slotIdx]);
                      return (
                        <div
                          key={slotIdx}
                          onClick={() => triggerCaptureSlot(slotIdx)}
                          title="Chạm để chụp / chụp lại ô này"
                          style={{
                            width: '100%',
                            height: '100%',
                            background: '#fdf5ed',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isCaptured ? (
                            <img
                              alt={`Ảnh ${slotIdx + 1}`}
                              src={capturedPhotos[slotIdx] || undefined}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <p
                              style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 22,
                                color: '#653125',
                              }}
                            >
                              {slotIdx + 1}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : selectedLayoutIdx === 1 ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 16,
                      top: 76,
                      width: 249,
                      height: 374,
                      padding: '14px 14px 66px 14px',
                      borderRadius: 12,
                      background: '#653125',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gridTemplateRows: 'repeat(2, 1fr)',
                      gap: 8,
                    }}
                  >
                    {Array.from({ length: 4 }, (_, slotIdx) => {
                      const isCaptured = Boolean(capturedPhotos[slotIdx]);
                      return (
                        <div
                          key={slotIdx}
                          onClick={() => triggerCaptureSlot(slotIdx)}
                          title="Chạm để chụp / chụp lại ô này"
                          style={{
                            width: '100%',
                            height: '100%',
                            background: '#fdf5ed',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isCaptured ? (
                            <img
                              alt={`Ảnh ${slotIdx + 1}`}
                              src={capturedPhotos[slotIdx] || undefined}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <p
                              style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 26,
                                color: '#653125',
                              }}
                            >
                              {slotIdx + 1}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        left: 60,
                        top: 60,
                        width: 159.149,
                        height: 477.457,
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                      data-node-id="I0:290;180:11"
                    >
                      <img
                        alt=""
                        src={`${REFERENCE_ASSET_BASE}s_rect58.svg`}
                        style={{
                          position: 'absolute',
                          inset: '-0.4% -1.15% -0.42% -1.58%',
                          width: '102.73%',
                          height: '100.82%',
                          display: 'block',
                        }}
                      />
                    </div>

                    {[0, 1, 2, 3].map((slotIdx) => {
                      const topPositions = [81, 179, 278.5, 378];
                      const isCaptured = Boolean(capturedPhotos[slotIdx]);
                      return (
                        <div
                          key={slotIdx}
                          onClick={() => triggerCaptureSlot(slotIdx)}
                          title="Chạm để chụp / chụp lại ô này"
                          style={{
                            position: 'absolute',
                            left: 68.5,
                            top: topPositions[slotIdx],
                            width: 143,
                            height: 95.5,
                            background: '#fdf5ed',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                          }}
                        >
                          {isCaptured ? (
                            <img
                              alt={`Ảnh ${slotIdx + 1}`}
                              src={capturedPhotos[slotIdx] || undefined}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <p
                              style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: 30,
                                letterSpacing: '-2.1px',
                                color: '#653125',
                              }}
                            >
                              {slotIdx + 1}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                <p
                  style={{
                    position: 'absolute',
                    left: 140,
                    top: 559,
                    transform: 'translateX(-50%)',
                    width: 200,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: 24,
                    color: '#653125',
                    textAlign: 'center',
                  }}
                  data-node-id="I0:290;180:20"
                >
                  {capturedCount} / {totalCaptureSlots}
                </p>
              </div>
            </div>
            </div>
          </>
        )}

        {/* ============================================================
            SCREEN 6 & 7: CHOOSE FRAME & FILTER ("0:331") + PRINTING ("10:23")
        ============================================================ */}
        {(screen === 'frame-filter' || screen === 'printing') && (
          <>
            <div className="header-bar-adaptive" data-node-id="0:384">
              <div
                className="brand-logo"
                onClick={() => setScreen('welcome')}
                data-node-id="0:385"
              >
                <img alt="Fotolism" src={`${REFERENCE_ASSET_BASE}f_group1.svg`} />
              </div>

              <div
                style={{
                  width: 960,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
                data-node-id="0:394"
              >
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontWeight: 600,
                    fontSize: 56,
                    letterSpacing: '-3.92px',
                    lineHeight: 'normal',
                    color: '#653125',
                    textAlign: 'center',
                    width: '100%',
                  }}
                  data-node-id="0:395"
                >
                  Frame &amp; Filter màu
                </p>
              </div>

              <div className="timer-shell" data-node-id="0:396">
                <div className="timer-oval-img" data-node-id="0:397">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}f_ellipse4.svg`} />
                </div>
                <p
                  className="timer-text"
                  style={{ color: '#653125' }}
                  data-node-id="0:398"
                >
                  {formattedTimer}
                </p>
              </div>
            </div>

            <div
              className="screen-canvas-center"
              data-node-id={screen === 'printing' ? '10:23' : '0:331'}
              data-name={
                screen === 'printing' ? 'Đang in ảnh' : 'Chọn Frame & Filter'
              }
            >
              <div
                style={{
                  position: 'absolute',
                  left: 360,
                  top: 205,
                  width: 380,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 20,
                  lineHeight: 1.4,
                  color: '#785c4f',
                  textAlign: 'center',
                }}
                data-node-id="0:377"
              >
                <p>Chạm để kéo, dùng hai ngón tay để phóng to ảnh</p>
              </div>

              {/* Live Interactive Photo Strip / 4x6 Preview */}
              {props.framePreview ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 80,
                    top: 265,
                    width: 560,
                    height: 640,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="0:333"
                  data-name="Dải ảnh xem trước"
                >
                  {props.framePreview}
                </div>
              ) : (
              <div
                style={{
                  position: 'absolute',
                  left: 334.19,
                  top: 290.27,
                  width: 211.611,
                  height: 586,
                  background: activeFrame.stripBg,
                  backgroundImage: activeFrame.stripPattern || 'none',
                  border: activeFrame.stripBorder || 'none',
                  borderRadius: 9.767,
                  boxShadow: '0px 6.511px 14.65px 0px rgba(64,33,20,0.15)',
                  overflow: 'hidden',
                  transition: 'background-color 0.2s ease',
                }}
                data-node-id="0:333"
                data-name="Dải ảnh xem trước"
              >
                {[0, 1, 2, 3].map((slotIdx) => {
                  const tops = [16.28, 149.76, 283.23, 416.71];
                  const nodeIds = ['0:334', '0:335', '0:336', '0:337'];
                  const offset = photoOffsets[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      onPointerDown={(e) => handleSlotPointerDown(slotIdx, e)}
                      style={{
                        position: 'absolute',
                        left: 13.02,
                        top: tops[slotIdx],
                        width: 185.567,
                        height: 123.711,
                        borderRadius: 3.256,
                        overflow: 'hidden',
                        cursor: 'grab', touchAction: 'none',
                      }}
                      data-node-id={nodeIds[slotIdx]}
                      title="Kéo để căn chỉnh vị trí ảnh"
                    >
                      <img
                        alt=""
                        src={capturedPhotos[slotIdx] || undefined}
                        style={{
                          position: 'absolute',
                          height: '100%',
                          left: `${offset.x}px`,
                          top: `${offset.y}px`,
                          width: '100%', objectFit: 'cover',
                          maxWidth: 'none',
                          filter: activeFilter.cssFilter,
                          transition: draggingSlot
                            ? 'none'
                            : 'filter 0.2s ease',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  );
                })}

                <div
                  style={{
                    position: 'absolute',
                    left: 55.51,
                    top: 545.49,
                    width: 100.596,
                    height: 32.191,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                  }}
                  data-node-id="0:338"
                >
                  <img
                    alt=""
                    src={`${REFERENCE_ASSET_BASE}f_sprite.png`}
                    style={{
                      position: 'absolute',
                      height: '2285.71%',
                      left: '-242.73%',
                      top: '-1954.29%',
                      width: '1163.64%',
                      maxWidth: 'none',
                      filter: activeFrame.logoFilter || 'none',
                    }}
                  />
                </div>
              </div>
              )}

              {/* Right Top Card: Chọn frame */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 700,
                  top: 290.27,
                  width: 1030,
                  height: 350,
                  background: '#ffffff',
                  borderRadius: 20,
                  boxShadow: '0px 4px 12px 0px rgba(64,33,20,0.08)',
                  overflow: 'hidden',
                }}
                data-node-id="0:339"
                data-name="Chọn frame"
              >
                <p
                  style={{
                    position: 'absolute',
                    left: 34,
                    top: 22,
                    width: 500,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 30,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="0:340"
                >
                  Chọn frame
                </p>

                <div
                  style={{
                    position: 'absolute',
                    left: 794.28,
                    top: 22.16,
                    width: 172,
                    height: 38,
                    background: '#fdf5ed',
                    borderRadius: 19,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  data-node-id="0:341"
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 20,
                      lineHeight: 1.4,
                      color: '#653125',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                    data-node-id="0:342"
                  >
                    {selectedLayout.badgeText}
                  </p>
                </div>

                {props.themes && props.themes.length > 0 ? (() => {
                  const total = props.themes.length;
                  const visibleCount = Math.min(6, total);
                  const maxStart = Math.max(0, total - visibleCount);
                  const windowStart = Math.min(maxStart, Math.max(0, selectedFrameIdx - 2));
                  const visibleThemes = props.themes.slice(windowStart, windowStart + visibleCount);
                  const localSelected = Math.max(0, selectedFrameIdx - windowStart);
                  return (
                    <>
                      <div
                        className="brush-border-brown"
                        style={{
                          position: 'absolute',
                          left: 84 + localSelected * 148,
                          top: 70,
                          width: 116,
                          height: 230,
                          background: '#fdf5ed',
                          borderRadius: 14,
                          transition: 'left 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                        data-node-id="0:343"
                      />

                      {visibleThemes.map((theme, vIdx) => {
                        const actualIdx = windowStart + vIdx;
                        const isSelected = actualIdx === selectedFrameIdx;
                        const centerLeft = 142 + vIdx * 148;
                        return (
                          <React.Fragment key={theme.id}>
                            <div
                              className="interactive-card"
                              onClick={() => setSelectedFrameIdx(actualIdx)}
                              style={{
                                position: 'absolute',
                                left: centerLeft,
                                top: theme.is2x6 ? 78 : 107,
                                transform: 'translateX(-50%)',
                                width: theme.is2x6 ? 70 : 104,
                                aspectRatio: theme.is2x6 ? '2 / 6' : '2 / 3',
                                height: 'auto',
                                background: theme.bgColor || '#ffffff',
                                borderRadius: 8,
                                border: '1px solid #e5d9cf',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {theme.overlayUrl ? (
                                <img
                                  alt={theme.name}
                                  src={theme.overlayUrl}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: 12, color: '#653125', textAlign: 'center', padding: 4 }}>
                                  {theme.name}
                                </span>
                              )}
                            </div>
                            <p
                              onClick={() => setSelectedFrameIdx(actualIdx)}
                              style={{
                                position: 'absolute',
                                left: centerLeft,
                                top: 305,
                                width: 136,
                                transform: 'translateX(-50%)',
                                fontFamily: 'var(--font-sans)',
                                fontWeight: isSelected ? 600 : 400,
                                fontSize: 18,
                                lineHeight: 1.3,
                                color: '#653125',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                              }}
                            >
                              {theme.name}
                            </p>
                          </React.Fragment>
                        );
                      })}

                      <div
                        style={{
                          position: 'absolute',
                          left: 173.28 + localSelected * 148,
                          top: 62,
                          width: 32,
                          height: 32,
                          transition: 'left 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                          pointerEvents: 'none',
                        }}
                        data-node-id="0:345"
                      >
                        <img
                          alt=""
                          src={`${REFERENCE_ASSET_BASE}f_frame6.svg`}
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="interactive-btn"
                        onClick={() =>
                          setSelectedFrameIdx((i) => (i - 1 + total) % total)
                        }
                        style={{
                          position: 'absolute',
                          left: 22,
                          top: 169,
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          background: '#fdf5ed',
                          border: 'none',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 32,
                          color: '#653125',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        data-node-id="0:359"
                      >
                        ‹
                      </button>

                      <button
                        type="button"
                        className="interactive-btn"
                        onClick={() =>
                          setSelectedFrameIdx((i) => (i + 1) % total)
                        }
                        style={{
                          position: 'absolute',
                          left: 966,
                          top: 169,
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          background: '#fdf5ed',
                          border: 'none',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 32,
                          color: '#653125',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        data-node-id="0:361"
                      >
                        ›
                      </button>
                    </>
                  );
                })() : (
                <>
                <div
                  className="brush-border-brown"
                  style={{
                    position: 'absolute',
                    left: 92 + selectedFrameIdx * 148,
                    top: 70,
                    width: 100,
                    height: 230,
                    background: '#fdf5ed',
                    borderRadius: 14,
                    transition: 'left 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  data-node-id="0:343"
                />

                {FRAME_OPTIONS.map((frame, idx) => {
                  const isSelected = idx === selectedFrameIdx;
                  return (
                    <React.Fragment key={frame.id}>
                      <div
                        className="interactive-card"
                        onClick={() => setSelectedFrameIdx(idx)}
                        style={{
                          position: 'absolute',
                          left: frame.left,
                          top: 78,
                          width: 84,
                          height: 214,
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          alt={frame.name}
                          src={`${REFERENCE_ASSET_BASE}f_sprite.png`}
                          style={{
                            position: 'absolute',
                            maxWidth: 'none',
                            ...frame.spriteStyle,
                          }}
                        />
                      </div>
                      <p
                        onClick={() => setSelectedFrameIdx(idx)}
                        style={{
                          position: 'absolute',
                          left: frame.labelCenter,
                          top: 305,
                          width: 130,
                          transform: 'translateX(-50%)',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: isSelected ? 600 : 400,
                          fontSize: 20,
                          lineHeight: 1.4,
                          color: '#653125',
                          textAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {frame.name}
                      </p>
                    </React.Fragment>
                  );
                })}

                <div
                  style={{
                    position: 'absolute',
                    left: 173.28 + selectedFrameIdx * 148,
                    top: 62,
                    width: 32,
                    height: 32,
                    transition: 'left 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                    pointerEvents: 'none',
                  }}
                  data-node-id="0:345"
                >
                  <img
                    alt=""
                    src={`${REFERENCE_ASSET_BASE}f_frame6.svg`}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="interactive-btn"
                  onClick={() =>
                    setSelectedFrameIdx(
                      (i) =>
                        (i - 1 + FRAME_OPTIONS.length) % FRAME_OPTIONS.length
                    )
                  }
                  style={{
                    position: 'absolute',
                    left: 22,
                    top: 169,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: '#fdf5ed',
                    border: 'none',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 32,
                    color: '#653125',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  data-node-id="0:359"
                >
                  ‹
                </button>

                <button
                  type="button"
                  className="interactive-btn"
                  onClick={() =>
                    setSelectedFrameIdx((i) => (i + 1) % FRAME_OPTIONS.length)
                  }
                  style={{
                    position: 'absolute',
                    left: 966,
                    top: 169,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: '#fdf5ed',
                    border: 'none',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 32,
                    color: '#653125',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  data-node-id="0:361"
                >
                  ›
                </button>
                </>
                )}
              </div>

              {/* Right Bottom Card: Chọn filter */}
              <div
                className="brush-border-brown"
                style={{
                  position: 'absolute',
                  left: 700,
                  top: 680.27,
                  width: 1030,
                  height: 196,
                  background: '#ffffff',
                  borderRadius: 20,
                  boxShadow: '0px 4px 12px 0px rgba(64,33,20,0.08)',
                  overflow: 'hidden',
                }}
                data-node-id="0:363"
                data-name="Chọn filter"
              >
                <p
                  style={{
                    position: 'absolute',
                    left: 33,
                    top: 30.16,
                    width: 800,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 30,
                    lineHeight: 1.4,
                    color: '#653125',
                  }}
                  data-node-id="0:364"
                >
                  Chọn filter
                </p>

                <div
                  style={{
                    position: 'absolute',
                    left: 33,
                    top: 89.31,
                    width: 924,
                    height: 64,
                    display: 'flex',
                    gap: 36,
                    alignItems: 'center',
                  }}
                  data-node-id="0:366"
                >
                  {FILTER_OPTIONS.map((filter, idx) => {
                    const isSelected = idx === selectedFilterIdx;
                    const filterRowIds = ['0:367', '0:371', '0:374'];
                    const swatchNodeIds = ['13:1734', '13:1730', '13:1726'];
                    return (
                      <div
                        key={filter.id}
                        onClick={() => setSelectedFilterIdx(idx)}
                        style={{
                          width: 255,
                          height: 64,
                          display: 'flex',
                          gap: 16,
                          alignItems: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        data-node-id={filterRowIds[idx]}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: 72,
                            height: 72,
                            flexShrink: 0,
                          }}
                          data-node-id={swatchNodeIds[idx]}
                          data-name={filter.name}
                        >
                          {isSelected ? (
                            idx === 0 ? (
                              <img
                                alt=""
                                src={filter.selectedSvg}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'block',
                                }}
                              />
                            ) : (
                              <>
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 66.6,
                                    height: 66.6,
                                    borderRadius: 33.3,
                                    border: `3.6px solid ${filter.ringColor}`,
                                  }}
                                />
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: 7.2,
                                    top: 7.2,
                                    width: 57.6,
                                    height: 57.6,
                                  }}
                                >
                                  <img
                                    alt=""
                                    src={filter.selectedSvg}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      display: 'block',
                                    }}
                                  />
                                </div>
                              </>
                            )
                          ) : (
                            <div
                              style={{
                                position: 'absolute',
                                left: 7.2,
                                top: 7.2,
                                width: 57.6,
                                height: 57.6,
                                borderRadius: 28.8,
                                background: filter.swatchColor,
                              }}
                            />
                          )}
                        </div>
                        <p
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontSize: 24,
                            lineHeight: 1.4,
                            color: '#653125',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {filter.name}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bottom-bar-adaptive">
              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('camera-booth')}
                data-node-id="0:378"
              >
                <div className="nav-pill-oval" data-node-id="0:379">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}f_ellipse2.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#653125' }}
                  data-node-id="0:380"
                >
                  quay lại
                </span>
              </button>

              <button
                type="button"
                className="nav-pill-btn interactive-btn"
                onClick={() => setScreen('printing')}
                data-node-id="0:381"
              >
                <div className="nav-pill-oval" data-node-id="0:382">
                  <img alt="" src={`${REFERENCE_ASSET_BASE}f_ellipse3.svg`} />
                </div>
                <span
                  className="nav-pill-label"
                  style={{ color: '#f7f8e0' }}
                  data-node-id="0:383"
                >
                  tiếp tục
                </span>
              </button>
            </div>

            {/* ============================================================
                SCREEN 7 OVERLAY: ĐANG IN ẢNH (node-id="10:23", Loading Screen "11:94")
                With Bouncing Ball Star Loading Animation
            ============================================================ */}
            {screen === 'printing' && (
              <div
                onClick={() => props.finishReady && props.onFinish?.()}
                aria-label="Trạng thái in ảnh"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.7)',
                  zIndex: 45,
                }}
                data-node-id="10:91"
              >
                <div
                  className="brush-border-cream"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: 'calc(50% + 0.28px)',
                    top: 'calc(50% - 0.45px)',
                    transform: 'translate(-50%, -50%)',
                    width: 576,
                    height: 466,
                    background: '#653125',
                    borderRadius: 20,
                    boxShadow: '0px 4px 20px -4px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                  }}
                  data-node-id="11:94"
                  data-name="Loading Screen"
                >
                  {/* Paper Grit Texture inside Loading Screen */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 'calc(50% - 0.28px)',
                      top: -308.91,
                      transform: 'translateX(-50%)',
                      width: 1919.068,
                      height: 1080,
                      mixBlendMode: 'color-burn',
                      opacity: 0.22,
                      pointerEvents: 'none',
                    }}
                    data-node-id="13:1670"
                    data-name="AP-Paper-Grit-05"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}ap_paper_grit.png`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'bottom',
                        display: 'block',
                      }}
                    />
                  </div>

                  {/* Loading Text */}
                  <p
                    style={{
                      position: 'absolute',
                      left: 286,
                      top: 318.92,
                      transform: 'translateX(-50%)',
                      width: 576,
                      fontFamily: 'var(--font-serif)',
                      fontWeight: 600,
                      fontSize: 42,
                      letterSpacing: '-2.94px',
                      lineHeight: 'normal',
                      color: '#f6f3e8',
                      textAlign: 'center',
                    }}
                    data-node-id="11:150"
                  >
                    Đang in ảnh của bạn...
                  </p>

                  {/* Hero Animated Bouncing Blue Star ("bouncing ball animation") */}
                  <div
                    className="bouncing-loading-star"
                    data-node-id="11:152"
                    data-name="Bouncing Loading Star"
                  >
                    <img
                      alt=""
                      src={`${REFERENCE_ASSET_BASE}p_loading_star.svg`}
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {props.delivery}
      {props.status && <div className="reference-operation-status" role="status">{props.status}</div>}
    </div>
  );
}
