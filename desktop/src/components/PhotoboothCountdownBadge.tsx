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
        (screen === 'capture' || screen === 'select-theme')

    const [secondsLeft, setSecondsLeft] = useState<number>(() => {
        if (!photoboothSessionEndTime) return 150
        return Math.max(
            0,
            Math.ceil((photoboothSessionEndTime - Date.now()) / 1000)
        )
    })

    const hasTimedOutRef = useRef(false)

    useEffect(() => {
        if (!isPhotoboothActive || !photoboothSessionEndTime) return

        hasTimedOutRef.current = false

        const timer = setInterval(() => {
            const remaining = Math.max(
                0,
                Math.ceil((photoboothSessionEndTime - Date.now()) / 1000)
            )
            setSecondsLeft(remaining)

            if (remaining <= 0 && !hasTimedOutRef.current) {
                hasTimedOutRef.current = true
                clearInterval(timer)

                // Hết 2 phút 30 giây: Tự động chuyển tiếp luồng (chờ AI enhance hoàn tất ở màn capture)
                const currentScreen = useAppStore.getState().screen
                if (currentScreen === 'capture') {
                    window.dispatchEvent(
                        new CustomEvent('fotolism:photobooth-capture-timeout')
                    )
                } else if (currentScreen === 'select-theme') {
                    setScreen('processing')
                }
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [
        isPhotoboothActive,
        photoboothSessionEndTime,
        selectedLayout.photosCount,
        setScreen,
        setSessionPhotos,
    ])

    if (!isPhotoboothActive) return null

    const mins = Math.floor(secondsLeft / 60)
    const secs = secondsLeft % 60
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    const isWarning = secondsLeft < 60
    const isDanger = secondsLeft < 30

    return (
        <div
            className={`photobooth-countdown-badge ${isDanger ? 'danger' : isWarning ? 'warning' : ''}`}
            title="Thời gian chụp và chọn ảnh còn lại của phiên Photobooth (2 phút 30 giây)"
            role="timer"
            aria-live="polite"
        >
            <Clock size={18} strokeWidth={2.4} />
            <span className="countdown-badge-label">Còn lại:</span>
            <span className="countdown-badge-time">{timeFormatted}</span>
        </div>
    )
}
