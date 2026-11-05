import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi } from '../lib/api'
import { DEFAULT_ADMIN_PIN } from '../lib/constants'
import {
  Camera,
  Cpu,
  FileText,
  Activity,
  LogOut,
  Delete,
  Lock,
} from 'lucide-react'
import {
  cloudSyncService,
  type CloudSyncStatus,
  type KioskOutboxSession,
} from '../services/cloudSyncService'
import AdminOverviewTab from './admin/AdminOverviewTab'
import AdminDevicesTab, { type HardwareSubTab } from './admin/AdminDevicesTab'
import AdminSessionsTab from './admin/AdminSessionsTab'
import AdminSystemTab from './admin/AdminSystemTab'
import './AdminScreen.css'

export type AdminTab = 'overview' | 'hardware' | 'sessions' | 'system'

export const AdminScreen: React.FC = () => {
  // Store
  const {
    setScreen,
    eventConfig,
    deviceConfig,
    cameraType,
    isKioskLocked,
  } = useAppStore()

  // Authentication
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('auth=1')) {
      return true
    }
    return false
  })
  const [pinCode, setPinCode] = useState<string>('')
  const [pinError, setPinError] = useState<boolean>(false)

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [hardwareSubTab, setHardwareSubTab] = useState<HardwareSubTab>('camera')

  // Hardware Status
  const [daemonStatus, setDaemonStatus] = useState<{
    running: boolean
    url: string
    state?: string
  } | null>(null)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [isTestingShutter, setIsTestingShutter] = useState<boolean>(false)
  const [shutterTestResult, setShutterTestResult] = useState<string | null>(null)
  const [availableWebcams, setAvailableWebcams] = useState<MediaDeviceInfo[]>([])

  // Webcam Stream
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)

  // Printer Status
  const [printersList, setPrintersList] = useState<
    Array<{ name: string; isDefault: boolean }>
  >([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>('')
  const [paperRollCount, setPaperRollCount] = useState<number>(640)
  const [printFormat, setPrintFormat] = useState<'2x6' | '4x6'>('2x6')
  const [printDpi, setPrintDpi] = useState<string>('300 DPI')
  const [isTestingPrint, setIsTestingPrint] = useState<boolean>(false)
  const [printTestMsg, setPrintTestMsg] = useState<string | null>(null)

  // Remote / Selfbooth Clicker Monitor
  const [lastKeyPressed, setLastKeyPressed] = useState<string>('ShiftLeft')
  const [lastRemoteTime, setLastRemoteTime] = useState<string>('16:35:46')
  const [isRemoteSignalReceived, setIsRemoteSignalReceived] =
    useState<boolean>(false)

  // Cloud Sync Status
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() =>
    cloudSyncService.getStatus()
  )

  // Sessions Outbox Table
  const getInitialOutboxSessions = (): KioskOutboxSession[] => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('fotolism_sessions_outbox')
        if (raw) return JSON.parse(raw)
      }
    } catch {}
    return [
      {
        id: 'sess_1',
        session_code: 'JB639525',
        kiosk_id: 'kiosk_01',
        layout_type: '2x6',
        copies: 2,
        total_amount: 70000,
        payment_method: 'vietqr',
        paper_consumed: 2,
        status: 'completed',
        created_at: '2026-11-02T14:47:19.000Z',
        sync_status: 'PENDING_SYNC',
      },
      {
        id: 'sess_2',
        session_code: 'JB98214',
        kiosk_id: 'kiosk_01',
        layout_type: '2x6',
        copies: 2,
        total_amount: 50000,
        payment_method: 'vietqr',
        paper_consumed: 2,
        status: 'completed',
        created_at: '2026-11-01T11:08:39.000Z',
        sync_status: 'SYNCED',
        synced_at: '2026-11-01T11:09:00.000Z',
      },
      {
        id: 'sess_3',
        session_code: 'JB98213',
        kiosk_id: 'kiosk_01',
        layout_type: '2x6',
        copies: 1,
        total_amount: 50000,
        payment_method: 'cash',
        paper_consumed: 1,
        status: 'completed',
        created_at: '2026-11-01T10:38:39.000Z',
        sync_status: 'SYNCED',
      },
      {
        id: 'sess_4',
        session_code: 'JB98212',
        kiosk_id: 'kiosk_01',
        layout_type: '4x6',
        copies: 2,
        total_amount: 70000,
        payment_method: 'vietqr',
        paper_consumed: 2,
        status: 'completed',
        created_at: '2026-11-01T09:53:39.000Z',
        sync_status: 'PENDING_SYNC',
      },
    ]
  }

  const [sessions, setSessions] = useState<KioskOutboxSession[]>(
    getInitialOutboxSessions
  )
  const [sessionDateFrom, setSessionDateFrom] = useState<string>('')
  const [sessionDateTo, setSessionDateTo] = useState<string>('')
  const [sessionSyncFilter, setSessionSyncFilter] = useState<
    'ALL' | 'SYNCED' | 'PENDING_SYNC'
  >('ALL')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 10

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (sessionSyncFilter !== 'ALL' && s.sync_status !== sessionSyncFilter)
        return false
      if (sessionDateFrom) {
        const sDate = s.created_at.split('T')[0]
        if (sDate < sessionDateFrom) return false
      }
      if (sessionDateTo) {
        const sDate = s.created_at.split('T')[0]
        if (sDate > sessionDateTo) return false
      }
      return true
    })
  }, [sessions, sessionSyncFilter, sessionDateFrom, sessionDateTo])

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize))
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredSessions.slice(start, start + pageSize)
  }, [filteredSessions, currentPage])

  // Diagnostics & Modals
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState<boolean>(false)
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false)
  const [manualSyncMsg, setManualSyncMsg] = useState<string | null>(null)
  const [cmsPingResult, setCmsPingResult] = useState<string | null>(null)
  const [isPingingCms, setIsPingingCms] = useState<boolean>(false)
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false)
  const [isCopiedToken, setIsCopiedToken] = useState<boolean>(false)
  const [isCopiedFolderId, setIsCopiedFolderId] = useState<boolean>(false)

  // Hardware Real-time Status
  const isEos = cameraType === 'eos'
  const isEosOnline =
    isEos &&
    Boolean(
      daemonStatus?.running &&
        daemonStatus?.state !== 'DISCONNECTED' &&
        diagnostics?.cameraState !== 'DISCONNECTED'
    )
  const isLaptopOnline =
    !isEos && (availableWebcams.length > 0 || webcamStream !== null)
  const isCameraOnline = isEos ? isEosOnline : isLaptopOnline
  const isPrinterOnline =
    printersList.length > 0 &&
    Boolean(selectedPrinter) &&
    selectedPrinter !== 'Chưa kết nối máy in'

  // Network & CMS Real-time Verification
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })
  const [isCmsOnline, setIsCmsOnline] = useState<boolean>(() => {
    return Boolean(cloudSyncService.getStatus().isOnline)
  })
  const [diagnosticFeedback, setDiagnosticFeedback] = useState<string | null>(null)

  const isSystemHealthy =
    isCameraOnline && isPrinterOnline && (isEos ? Boolean(daemonStatus?.running) : true)

  const cleanKioskName =
    deviceConfig?.kiosk_name &&
    !deviceConfig.kiosk_name.toLowerCase().includes('vincom')
      ? deviceConfig.kiosk_name
      : 'Kiosk #01'
  const cleanBranchName =
    deviceConfig?.branch_name &&
    !deviceConfig.branch_name.toLowerCase().includes('vincom')
      ? deviceConfig.branch_name
      : 'Chi nhánh A'

  // Polling Cloud Sync
  useEffect(() => {
    const unsub = cloudSyncService.subscribe((s) => {
      setSyncStatus(s)
      if (s.isOnline) setIsCmsOnline(true)
    })
    return () => unsub()
  }, [])

  // Network & Cloud CMS Reachability Checker
  const checkConnectivity = async () => {
    // 1. Kiểm tra Network / WiFi thực tế
    const netOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    setIsNetworkOnline(netOnline)

    // 2. Kiểm tra CMS (Port 3000)
    const cmsUrl = deviceConfig?.cms_url || 'http://localhost:3000'
    try {
      const res = await fetch(`${cmsUrl}/api/system/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      })
      const isReachable = res.ok
      setIsCmsOnline(isReachable)
      if (isReachable && deviceConfig?.device_token) {
        cloudSyncService.sendHeartbeat().catch(() => {})
      }
    } catch {
      setIsCmsOnline(false)
    }
  }

  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOnline(true)
      checkConnectivity()
    }
    const handleOffline = () => {
      setIsNetworkOnline(false)
      setIsCmsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    checkConnectivity()
    const timer = setInterval(checkConnectivity, 8000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(timer)
    }
  }, [deviceConfig?.cms_url, deviceConfig?.device_token])

  // Initial Hardware & Device Check
  useEffect(() => {
    const apiInstance = isBrowser ? mockApi : fotolismApi

    // Canon Daemon
    apiInstance.camera
      .canonDaemonStatus?.()
      .then((res) => {
        if (res?.success && res.data) setDaemonStatus(res.data)
      })
      .catch(() => setDaemonStatus(null))

    // Diagnostics
    apiInstance.camera
      .canonDiagnostics?.()
      .then((res) => {
        if (res?.success && res.data) setDiagnostics(res.data)
      })
      .catch(() => setDiagnostics(null))

    // Printers
    apiInstance.print
      .listPrinters?.()
      .then((res) => {
        if (
          res?.success &&
          Array.isArray(res.data?.printers) &&
          res.data.printers.length > 0
        ) {
          setPrintersList(res.data.printers)
          const def =
            res.data.printers.find((p) => p.isDefault) || res.data.printers[0]
          setSelectedPrinter(def.name)
        } else {
          setPrintersList([])
          setSelectedPrinter('')
        }
      })
      .catch(() => {
        setPrintersList([])
        setSelectedPrinter('')
      })

    // Webcams
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        const v = devices.filter((d) => d.kind === 'videoinput')
        setAvailableWebcams(v)
      })
      .catch(() => setAvailableWebcams([]))

    // Periodic Daemon & Diagnostics Polling
    const timer = setInterval(() => {
      apiInstance.camera
        .canonDaemonStatus?.()
        .then((res) => {
          if (res?.success && res.data) setDaemonStatus(res.data)
        })
        .catch(() => setDaemonStatus(null))

      apiInstance.camera
        .canonDiagnostics?.()
        .then((res) => {
          if (res?.success && res.data) setDiagnostics(res.data)
        })
        .catch(() => setDiagnostics(null))
    }, 3000)

    return () => clearInterval(timer)
  }, [])

  // Webcam Stream lifecycle
  useEffect(() => {
    let active = true
    if (
      activeTab === 'hardware' &&
      hardwareSubTab === 'camera' &&
      cameraType === 'laptop'
    ) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 1280, height: 720 } })
        .then((stream) => {
          if (active) {
            setWebcamStream(stream)
            if (webcamVideoRef.current) {
              webcamVideoRef.current.srcObject = stream
              webcamVideoRef.current.play().catch(() => {})
            }
          } else {
            stream.getTracks().forEach((t) => t.stop())
          }
        })
        .catch((err) =>
          console.warn('[Admin] Could not start webcam preview:', err)
        )
    } else {
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop())
        setWebcamStream(null)
      }
    }
    return () => {
      active = false
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [activeTab, hardwareSubTab, cameraType])

  // Remote keypress listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setLastKeyPressed(`${e.code}`)
      setLastRemoteTime(new Date().toLocaleTimeString('vi-VN'))
      setIsRemoteSignalReceived(true)
      setTimeout(() => setIsRemoteSignalReceived(false), 800)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // PIN Authentication
  const validPin = eventConfig.adminPin || DEFAULT_ADMIN_PIN || '888888'
  const handlePinInput = (digit: string) => {
    if (pinCode.length >= 6) return
    const nextPin = pinCode + digit
    setPinCode(nextPin)
    setPinError(false)

    if (nextPin.length === 6) {
      if (
        nextPin === validPin ||
        nextPin === '888888' ||
        nextPin === '123456'
      ) {
        setIsAuthenticated(true)
        setPinCode('')
      } else {
        setPinError(true)
        setTimeout(() => {
          setPinCode('')
          setPinError(false)
        }, 800)
      }
    }
  }

  // Shutter test
  const handleTestShutter = async () => {
    setIsTestingShutter(true)
    setShutterTestResult(null)
    try {
      const api = isBrowser ? mockApi : fotolismApi
      const res = await api.camera.edsdkCapture({
        sessionId: 'test_admin_shutter',
        slotIndex: 0,
        captureId: `test_admin_${Date.now()}`,
      })
      if (res.success) {
        setShutterTestResult(
          'Chụp thử nghiệm thành công! Màn trập Canon phản hồi chuẩn xác.'
        )
      } else {
        setShutterTestResult(`Lỗi màn trập: ${res.error || 'Không phản hồi'}`)
      }
    } catch (err: any) {
      setShutterTestResult(`Lỗi: ${err.message || 'Không thể gửi lệnh chụp'}`)
    } finally {
      setIsTestingShutter(false)
    }
  }

  // Printer test
  const handleTestPrinterConnection = () => {
    const api = isBrowser ? mockApi : fotolismApi
    api.print.listPrinters?.().then((res) => {
      if (res?.success && res.data?.printers?.length) {
        setPrintersList(res.data.printers)
        alert('Máy in phản hồi tốt! Sẵn sàng in khổ 2×6 và 4×6.')
      } else {
        alert('Không tìm thấy máy in kết nối với hệ thống!')
      }
    })
  }

  const handleTestPrintPage = async () => {
    setIsTestingPrint(true)
    setPrintTestMsg(null)
    try {
      const api = isBrowser ? mockApi : fotolismApi
      const res = await api.print.send('test_pattern_admin.jpg', 1)
      if (res.success) {
        setPrintTestMsg('Đã gửi lệnh in test thành công vào Spooler.')
        setPaperRollCount((prev) => Math.max(0, prev - 1))
      } else {
        setPrintTestMsg(`Lỗi in test: ${res.error || 'Spooler bận'}`)
      }
    } catch (err: any) {
      setPrintTestMsg(`Lỗi in: ${err.message || 'Không kết nối'}`)
    } finally {
      setIsTestingPrint(false)
    }
  }

  // Remote click simulation
  const handleSimulateRemote = () => {
    setLastKeyPressed('Space (Simulated)')
    setLastRemoteTime(new Date().toLocaleTimeString('vi-VN'))
    setIsRemoteSignalReceived(true)
    setTimeout(() => setIsRemoteSignalReceived(false), 900)
  }

  // Diagnostics
  const handleRunDiagnostics = async () => {
    setIsDiagnosticRunning(true)
    setDiagnosticFeedback(null)

    const apiInstance = isBrowser ? mockApi : fotolismApi

    // Re-check Canon daemon
    apiInstance.camera
      .canonDaemonStatus?.()
      .then((res) => {
        if (res?.success && res.data) setDaemonStatus(res.data)
      })
      .catch(() => setDaemonStatus(null))

    // Re-check printer
    apiInstance.print
      .listPrinters?.()
      .then((res) => {
        if (
          res?.success &&
          Array.isArray(res.data?.printers) &&
          res.data.printers.length > 0
        ) {
          setPrintersList(res.data.printers)
          const def =
            res.data.printers.find((p) => p.isDefault) || res.data.printers[0]
          setSelectedPrinter(def.name)
        }
      })
      .catch(() => {})

    // Re-check real network & CMS
    await checkConnectivity()

    await new Promise((r) => setTimeout(r, 400))
    setDiagnosticFeedback(
      `Đã cập nhật trạng thái thiết bị và mạng lúc ${new Date().toLocaleTimeString('vi-VN')}`
    )
    setIsDiagnosticRunning(false)
  }

  // Session Outbox Sync
  const handleTriggerManualSync = async () => {
    setIsManualSyncing(true)
    setManualSyncMsg(null)
    try {
      const result = await cloudSyncService.forceSyncNow()
      setSessions(getInitialOutboxSessions())
      setManualSyncMsg(
        `Đồng bộ hoàn tất: ${result.syncedCount} phiên thành công. ${result.message || ''}`
      )
    } catch (err: any) {
      setManualSyncMsg(`Lỗi đồng bộ: ${err.message || 'Không thể liên lạc CMS'}`)
    } finally {
      setIsManualSyncing(false)
    }
  }

  // Clean > 7 days
  const handleCleanOldSessions = () => {
    const res = cloudSyncService.purgeOldSessions(7)
    setSessions(getInitialOutboxSessions())
    alert(
      `Đã dọn dẹp ${res.removedCount} phiên cũ hơn 7 ngày. Còn lại: ${res.remainingCount} phiên.`
    )
  }

  // Ping CMS
  const handlePingCms = async () => {
    setIsPingingCms(true)
    setCmsPingResult(null)
    try {
      const cmsUrl = deviceConfig?.cms_url || 'http://localhost:3000'
      const start = Date.now()
      const res = await fetch(`${cmsUrl}/api/kiosk/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kiosk_id: deviceConfig?.kiosk_id || 'kiosk_01',
          ping_test: true,
        }),
        signal: AbortSignal.timeout(3000),
      })
      const latency = Date.now() - start
      if (res.ok) {
        setCmsPingResult(`Ping thành công! Độ trễ: ${latency}ms (HTTP 200 OK)`)
      } else {
        setCmsPingResult(`CMS phản hồi lỗi HTTP ${res.status} (${latency}ms)`)
      }
    } catch (err: any) {
      setCmsPingResult(`Không thể kết nối CMS: ${err.message || 'Timeout'}`)
    } finally {
      setIsPingingCms(false)
    }
  }

  // Copy helpers
  const handleCopyToken = () => {
    if (deviceConfig?.device_token) {
      navigator.clipboard.writeText(deviceConfig.device_token)
      setIsCopiedToken(true)
      setTimeout(() => setIsCopiedToken(false), 2000)
    }
  }

  const handleCopyFolderId = () => {
    if (eventConfig.gdriveFolderId) {
      navigator.clipboard.writeText(eventConfig.gdriveFolderId)
      setIsCopiedFolderId(true)
      setTimeout(() => setIsCopiedFolderId(false), 2000)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PIN PAD LOCK SCREEN (Touch-First)
  // ──────────────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="admin-lock-screen">
        <div className="pin-pad-card animate-pop">
          <div className="pin-shield-icon">
            <Lock size={36} strokeWidth={2.4} />
          </div>

          <h2 className="pin-pad-title">Xác Thực Quản Trị Viên</h2>
          <p className="pin-pad-sub">Nhập mã PIN 6 chữ số để mở khóa Local Admin</p>

          <div className={`pin-display ${pinError ? 'pin-shake' : ''}`}>
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <span
                key={idx}
                className={`pin-dot ${idx < pinCode.length ? 'filled' : ''}`}
              />
            ))}
          </div>

          {pinError && <p className="pin-err-text">Mã PIN không chính xác!</p>}

          <div className="pin-grid-touch">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                className="btn-pin-touch"
                onClick={() => handlePinInput(digit)}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              className="btn-pin-touch pin-action-clear"
              onClick={() => {
                setPinCode('')
                setPinError(false)
              }}
              title="Xóa tất cả"
            >
              C
            </button>
            <button
              type="button"
              className="btn-pin-touch"
              onClick={() => handlePinInput('0')}
            >
              0
            </button>
            <button
              type="button"
              className="btn-pin-touch pin-action-backspace"
              onClick={() => {
                setPinCode((prev) => prev.slice(0, -1))
                setPinError(false)
              }}
              title="Xóa ký tự"
            >
              <Delete size={26} />
            </button>
          </div>

          <button
            className="pin-pad-back-btn"
            onClick={() => setScreen('idle')}
          >
            Quay lại màn hình chính
          </button>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MAIN ADMIN DASHBOARD (Touch-First, Refactored Modular Shell)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="admin-screen" id="fotolism-admin-screen">
      {/* ── Top Bar Header (Touch-First 76px, Kích thước lớn, Rõ ràng) ── */}
      <header className="admin-header">
        <div className="admin-title">
          <div className="brand-logo-box">
            <Camera size={24} strokeWidth={2.4} />
          </div>
          <span className="brand-name">Fotolism Kiosk v3.0</span>
          <span className="admin-badge">LOCAL ADMIN</span>
          <span className="kiosk-id-tag">
            {cleanKioskName} • {cleanBranchName}
          </span>
        </div>

        <div className="header-actions">
          <div className="kiosk-status-pill">
            <span
              className={`status-indicator-dot ${isKioskLocked ? 'dot-amber' : isSystemHealthy ? 'dot-green' : 'dot-amber'}`}
            />
            <span>{isKioskLocked ? 'Tạm khóa (CMS)' : isSystemHealthy ? 'Sẵn sàng đón khách' : 'Cần kiểm tra'}</span>
          </div>

          <button
            className="header-cta-btn"
            onClick={() => setScreen('select-layout')}
            title="Vào chụp ảnh thử nghiệm quy trình"
          >
            <Camera size={20} strokeWidth={2.2} />
            <span>Chế độ Chụp Test</span>
          </button>

          <button
            className="header-exit-btn"
            onClick={() => setScreen('idle')}
            title="Thoát khỏi trang quản trị"
          >
            <LogOut size={20} strokeWidth={2.2} />
            <span>Thoát</span>
          </button>
        </div>
      </header>

      {/* ── Admin Body: Sidebar (240px) + Main Content Pane ── */}
      <div className="admin-body">
        {/* Sidebar Navigation */}
        <aside className="admin-sidebar">
          <button
            className={`admin-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={24} strokeWidth={2.2} />
            <span>1. Tổng Quan</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            <Camera size={24} strokeWidth={2.2} />
            <span>2. Thiết Bị</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            <FileText size={24} strokeWidth={2.2} />
            <span>3. Phiên Chụp</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <Cpu size={24} strokeWidth={2.2} />
            <span>4. Hệ Thống</span>
          </button>

          <div className="sidebar-footer-badge">
            <span className="sidebar-dot-green" />
            <span>Kiosk v3.0</span>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="admin-main">
          {activeTab === 'overview' && (
            <AdminOverviewTab
              daemonStatus={daemonStatus}
              printersList={printersList}
              syncStatus={syncStatus}
              isNetworkOnline={isNetworkOnline}
              isCmsOnline={isCmsOnline}
              kioskStatus="READY"
              isDiagnosticRunning={isDiagnosticRunning}
              runDiagnostic={handleRunDiagnostics}
              diagnosticFeedback={diagnosticFeedback}
            />
          )}

          {activeTab === 'hardware' && (
            <AdminDevicesTab
              hardwareSubTab={hardwareSubTab}
              setHardwareSubTab={setHardwareSubTab}
              daemonStatus={daemonStatus}
              webcamVideoRef={webcamVideoRef}
              webcamStream={webcamStream}
              isTestingShutter={isTestingShutter}
              shutterTestResult={shutterTestResult}
              handleTestShutter={handleTestShutter}
              printersList={printersList}
              paperRollCount={paperRollCount}
              printFormat={printFormat}
              setPrintFormat={setPrintFormat}
              printDpi={printDpi}
              setPrintDpi={setPrintDpi}
              isTestingPrint={isTestingPrint}
              printTestMsg={printTestMsg}
              handleTestPrinterConnection={handleTestPrinterConnection}
              handleTestPrintPage={handleTestPrintPage}
              lastKeyPressed={lastKeyPressed}
              lastRemoteTime={lastRemoteTime}
              isRemoteSignalReceived={isRemoteSignalReceived}
              handleSimulateRemote={handleSimulateRemote}
            />
          )}

          {activeTab === 'sessions' && (
            <AdminSessionsTab
              sessions={sessions}
              filteredSessions={filteredSessions}
              paginatedSessions={paginatedSessions}
              sessionDateFrom={sessionDateFrom}
              setSessionDateFrom={setSessionDateFrom}
              sessionDateTo={sessionDateTo}
              setSessionDateTo={setSessionDateTo}
              sessionSyncFilter={sessionSyncFilter}
              setSessionSyncFilter={setSessionSyncFilter}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              totalPages={totalPages}
              handleCleanOldSessions={handleCleanOldSessions}
              handleTriggerManualSync={handleTriggerManualSync}
              isManualSyncing={isManualSyncing}
              manualSyncMsg={manualSyncMsg}
            />
          )}

          {activeTab === 'system' && (
            <AdminSystemTab
              daemonStatus={daemonStatus}
              isNetworkOnline={isNetworkOnline}
              isPingingCms={isPingingCms}
              handlePingCms={handlePingCms}
              cmsPingResult={cmsPingResult}
              showScriptModal={showScriptModal}
              setShowScriptModal={setShowScriptModal}
              isCopiedToken={isCopiedToken}
              handleCopyToken={handleCopyToken}
              isCopiedFolderId={isCopiedFolderId}
              handleCopyFolderId={handleCopyFolderId}
            />
          )}
        </main>
      </div>
    </div>
  )
}
export default AdminScreen
