import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { cloudSyncService } from './services/cloudSyncService'
import DeviceActivationScreen from './screens/DeviceActivationScreen'
import IdleScreen from './screens/IdleScreen'
import SelectFrameSizeScreen from './screens/SelectFrameSizeScreen'
import SelectLayoutScreen from './screens/SelectLayoutScreen'
import CaptureScreen from './screens/CaptureScreen'
import ConfirmScreen from './screens/ConfirmScreen'
import PaymentScreen from './screens/PaymentScreen'
import ThemeSelectScreen from './screens/ThemeSelectScreen'
import FilterScreen from './screens/FilterScreen'
import ReviewScreen from './screens/ReviewScreen'
import AdminScreen from './screens/AdminScreen'
import OverheadScreen from './screens/OverheadScreen'
import SelfboothSetupScreen from './screens/SelfboothSetupScreen'
import SelfboothPhotoSelectScreen from './screens/SelfboothPhotoSelectScreen'
import ProcessingScreen from './screens/ProcessingScreen'
import ErrorNotificationCenter from './components/ErrorNotificationCenter'
import KioskLockOverlay from './components/KioskLockOverlay'
import PhotoboothCountdownBadge from './components/PhotoboothCountdownBadge'
import './App.css'

export default function App() {
    const storeScreen = useAppStore((s) => s.screen)
    const setScreen = useAppStore((s) => s.setScreen)
    const loadDeviceConfig = useAppStore((s) => s.loadDeviceConfig)
    const isKioskLocked = useAppStore((s) => s.isKioskLocked)
    const setIsKioskLocked = useAppStore((s) => s.setIsKioskLocked)

    // Lắng nghe trạng thái khóa máy (isLocked) từ Cloud CMS Heartbeat
    useEffect(() => {
        const unsubscribe = cloudSyncService.subscribe((status) => {
            if (typeof status.isLocked === 'boolean') {
                setIsKioskLocked(status.isLocked)
            }
        })
        return () => unsubscribe()
    }, [setIsKioskLocked])

    const isOverhead =
        typeof window !== 'undefined' &&
        window.location.search.includes('mode=overhead')

    // Đọc màn hình ban đầu từ query param (ví dụ ?screen=payment) rồi xoá param để điều hướng Zustand hoạt động thông suốt
    useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(window.location.search)
        const initialScreen = params.get('screen')
        if (initialScreen) {
            setScreen(initialScreen as any)
        }
    }, [setScreen])

    const screen = storeScreen

    // Kiểm tra file device_config.json khi bật ứng dụng
    // Nếu đã có device_token: Vào thẳng màn hình chờ IdleScreen và chạy CloudSync
    // Nếu chưa có: Hiện màn hình "Kích hoạt thiết bị"
    useEffect(() => {
        let isMounted = true

        const checkActivation = async () => {
            const config = await loadDeviceConfig()
            if (!isMounted) return

            if (config?.device_token) {
                cloudSyncService.setDeviceConfig(config)
                cloudSyncService.startWorker()
                if (useAppStore.getState().screen === 'activate') {
                    setScreen('idle')
                }
            } else {
                const hasExplicitScreen =
                    typeof window !== 'undefined' &&
                    Boolean(
                        window.location?.search &&
                        new URLSearchParams(window.location.search).get(
                            'screen'
                        )
                    )
                if (!hasExplicitScreen) {
                    setScreen('activate')
                }
            }
        }

        checkActivation()
        return () => {
            isMounted = false
            cloudSyncService.stopWorker()
        }
    }, [loadDeviceConfig, setScreen])

    if (isOverhead) {
        return <OverheadScreen />
    }

    return (
        <div className="app-root">
            {screen === 'activate' && <DeviceActivationScreen />}
            {screen === 'idle' && <IdleScreen />}
            {screen === 'select-size' && <SelectFrameSizeScreen />}
            {screen === 'select-layout' && <SelectLayoutScreen />}
            {screen === 'confirm' && <ConfirmScreen />}
            {screen === 'selfbooth-setup' && <SelfboothSetupScreen />}
            {screen === 'selfbooth-select' && <SelfboothPhotoSelectScreen />}
            {screen === 'payment' && <PaymentScreen />}
            {screen === 'capture' && <CaptureScreen />}
            {screen === 'select-theme' && <ThemeSelectScreen />}
            {(screen === 'select-filter' || screen === 'select-sticker') && (
                <FilterScreen />
            )}
            {screen === 'processing' && <ProcessingScreen />}
            {screen === 'review' && <ReviewScreen />}
            {screen === 'admin' && <AdminScreen />}

            {/* Trung tâm thông báo lỗi API & Camera Logs */}
            <ErrorNotificationCenter />

            {/* Lệnh khóa máy từ xa từ Cloud CMS */}
            {isKioskLocked && <KioskLockOverlay />}

            {/* Đồng hồ đếm ngược 4 phút phiên Photobooth ở góc phải */}
            <PhotoboothCountdownBadge />
        </div>
    )
}
