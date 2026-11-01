import { useState, useEffect } from 'react'
import './OverheadScreen.css'

export default function OverheadScreen() {
  const [cameraState, setCameraState] = useState<string>('CONNECTING')
  const [fps, setFps] = useState<number>(0)
  const [streamError, setStreamError] = useState<boolean>(false)

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:8899/status', { signal: AbortSignal.timeout(600) })
        if (res.ok) {
          const data = await res.json()
          setCameraState(data.cameraState || (data.connected ? 'LIVEVIEW' : 'DISCONNECTED'))
          setFps(data.fps || 0)
          setStreamError(false)
        } else {
          setCameraState('DISCONNECTED')
          setStreamError(true)
        }
      } catch {
        setCameraState('DISCONNECTED')
        setStreamError(true)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="overhead-container">
      {/* Live View MJPEG Stream */}
      {!streamError && cameraState !== 'DISCONNECTED' ? (
        <img
          src="http://127.0.0.1:8899/liveview"
          alt="Overhead Live View"
          className="overhead-stream"
          onError={() => setStreamError(true)}
        />
      ) : (
        <div className="overhead-placeholder">
          <div className="placeholder-content">
            <span className="placeholder-icon">📷</span>
            <h2>fotolism photobooth</h2>
            <p className="placeholder-sub">
              {cameraState === 'CONNECTING' ? 'Đang kết nối máy ảnh Canon EOS R100...' : 'Máy ảnh đang ở chế độ chờ'}
            </p>
          </div>
        </div>
      )}

      {/* Overhead Header Overlay */}
      <div className="overhead-header">
        <div className="overhead-brand">
          <span className="brand-dot" />
          <span className="brand-name">fotolism overhead</span>
        </div>
        <div className="overhead-telemetry">
          <span className={`status-badge ${cameraState.toLowerCase()}`}>{cameraState}</span>
          {fps > 0 && <span className="fps-badge">{fps.toFixed(0)} FPS</span>}
        </div>
      </div>

      {/* Focus / Look Here Prompt */}
      <div className="overhead-footer">
        <div className="look-prompt">
          <span className="look-icon">✨</span>
          <span className="look-text">NHÌN THẲNG VÀO ỐNG KÍNH & CƯỜI TƯƠI NÀO!</span>
          <span className="look-icon">✨</span>
        </div>
      </div>
    </div>
  )
}
