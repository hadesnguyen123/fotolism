import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { Clock } from 'lucide-react'
import './PhotoboothCountdownBadge.css'

export default function PhotoboothCountdownBadge() {
  const {
    screen,
    eventConfig,
    photoboothSessionEndTime,
    setScreen,
    setSessionPhotos,
    selectedLayout,
  } = useAppStore()

  const isSelfbooth = eventConfig.captureMode === 'selfbooth'
  const isPhotoboothActive =
    !isSelfbooth &&
    photoboothSessionEndTime !== null &&
    (screen === 'capture' || screen === 'select-theme' || screen === 'select-filter' || screen === 'select-sticker')

  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (!photoboothSessionEndTime) return 240
    return Math.max(0, Math.ceil((photoboothSessionEndTime - Date.now()) / 1000))
  })

  const hasTimedOutRef = useRef(false)

  useEffect(() => {
    if (!isPhotoboothActive || !photoboothSessionEndTime) return

    hasTimedOutRef.current = false

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((photoboothSessionEndTime - Date.now()) / 1000))
      setSecondsLeft(remaining)

      if (remaining <= 0 && !hasTimedOutRef.current) {
        hasTimedOutRef.current = true
        clearInterval(timer)

        // Hết 4 phút: Tự động chuyển tiếp luồng
        const currentScreen = useAppStore.getState().screen
        if (currentScreen === 'capture') {
          const currentPhotos = useAppStore.getState().session?.photos || []
          const needed = selectedLayout.photosCount || 4
          if (currentPhotos.length > 0) {
            const filled = [...currentPhotos]
            while (filled.length < needed) {
              filled.push(filled[filled.length - 1])
            }
            setSessionPhotos(filled.slice(0, needed))
          }
          setScreen('select-theme')
        } else if (currentScreen === 'select-theme' || currentScreen === 'select-filter' || currentScreen === 'select-sticker') {
          setScreen('processing')
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [isPhotoboothActive, photoboothSessionEndTime, selectedLayout.photosCount, setScreen, setSessionPhotos])

  if (!isPhotoboothActive) return null

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const isWarning = secondsLeft < 60
  const isDanger = secondsLeft < 30

  return (
    <div
      className={`photobooth-countdown-badge ${isDanger ? 'danger' : isWarning ? 'warning' : ''}`}
      title="Thời gian chụp và chọn ảnh còn lại của phiên Photobooth (4 phút)"
      role="timer"
      aria-live="polite"
    >
      <Clock size={18} strokeWidth={2.4} />
      <span className="countdown-badge-label">Còn lại:</span>
      <span className="countdown-badge-time">{timeFormatted}</span>
    </div>
  )
}

