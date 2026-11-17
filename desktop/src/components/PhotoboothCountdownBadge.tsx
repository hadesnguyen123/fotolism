import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store/appStore'

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
        screen === 'capture'

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

                // Hết 2 phút 30 giây ở màn capture: Tự động chuyển tiếp luồng (chờ AI enhance hoàn tất)
                if (useAppStore.getState().screen === 'capture') {
                    window.dispatchEvent(
                        new CustomEvent('fotolism:photobooth-capture-timeout')
                    )
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

    // Giao diện Photobooth đã hiển thị đồng hồ 02:30s trực tiếp trong .timer-shell ở màn capture (camera-booth)
    void secondsLeft
    return null
}
