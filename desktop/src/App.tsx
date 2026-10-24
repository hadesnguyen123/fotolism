import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { cloudSyncService } from './services/cloudSyncService'
import IdleScreen from './screens/IdleScreen'
import SelectFrameSizeScreen from './screens/SelectFrameSizeScreen'
import SelectLayoutScreen from './screens/SelectLayoutScreen'
import CaptureScreen from './screens/CaptureScreen'
import PaymentScreen from './screens/PaymentScreen'
import ThemeSelectScreen from './screens/ThemeSelectScreen'
import FilterScreen from './screens/FilterScreen'
import ReviewScreen from './screens/ReviewScreen'
import AdminScreen from './screens/AdminScreen'
import OverheadScreen from './screens/OverheadScreen'
import ErrorNotificationCenter from './components/ErrorNotificationCenter'
import './App.css'

export default function App() {
  const storeScreen = useAppStore((s) => s.screen)
  const isOverhead = typeof window !== 'undefined' && window.location.search.includes('mode=overhead')
  const queryScreen = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('screen') : null
  const screen = queryScreen || storeScreen

  // Khởi động Background Sync Worker liên thông Cloud CMS (Heartbeat + Outbox Sync)
  useEffect(() => {
    cloudSyncService.startWorker()
    return () => cloudSyncService.stopWorker()
  }, [])

  if (isOverhead) {
    return <OverheadScreen />
  }

  return (
    <div className="app-root">
      {screen === 'idle' && <IdleScreen />}
      {screen === 'select-size' && <SelectFrameSizeScreen />}
      {screen === 'select-layout' && <SelectLayoutScreen />}
      {screen === 'payment' && <PaymentScreen />}
      {screen === 'capture' && <CaptureScreen />}
      {screen === 'select-theme' && <ThemeSelectScreen />}
      {(screen === 'select-filter' || screen === 'select-sticker') && <FilterScreen />}
      {screen === 'review' && <ReviewScreen />}
      {screen === 'admin' && <AdminScreen />}

      {/* Trung tâm thông báo lỗi API & Camera Logs */}
      <ErrorNotificationCenter />
    </div>
  )
}
