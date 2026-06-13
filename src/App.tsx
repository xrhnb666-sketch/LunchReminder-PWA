import { useEffect, useState } from 'react'
import { BottomNavigation } from './components/BottomNavigation'
import { SplashScreen } from './components/SplashScreen'
import { StatusToasts } from './components/StatusToasts'
import { useLunchReminderStore } from './hooks/useLunchReminderStore'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { usePushNotifications } from './hooks/usePushNotifications'
import { usePwaUpdateStatus } from './hooks/usePwaUpdateStatus'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import type { AppPage } from './types/reminder'

const App = () => {
  const [showSplash, setShowSplash] = useState(true)
  const [currentPage, setCurrentPage] = useState<AppPage>('home')
  const online = useNetworkStatus()
  const updateAvailable = usePwaUpdateStatus()
  const store = useLunchReminderStore()
  const push = usePushNotifications(store.settings)

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSplash(false), 800)
    return () => window.clearTimeout(timeout)
  }, [])

  if (showSplash) {
    return <SplashScreen />
  }

  return (
    <div className="app-shell">
      <div className="phone-frame">
        {currentPage === 'home' && (
          <HomePage
            settings={store.settings}
            nextReminder={store.nextReminder}
            onMealEnabledChange={store.setMealEnabled}
            onMealTimeChange={store.setMealTime}
            onSkipTodayChange={store.setSkipToday}
          />
        )}
        {currentPage === 'history' && <HistoryPage history={store.history} />}
        {currentPage === 'statistics' && <StatisticsPage history={store.history} />}
        {currentPage === 'settings' && (
          <SettingsPage
            settings={store.settings}
            push={push}
            onWeekdaysOnlyChange={store.setWeekdaysOnly}
            onSkipTodayChange={store.setSkipToday}
            onThemeModeChange={store.setThemeMode}
          />
        )}
        <BottomNavigation currentPage={currentPage} onChange={setCurrentPage} />
        <StatusToasts
          offline={!online}
          saved={store.saveStatus === 'saved'}
          updateAvailable={updateAvailable}
        />
      </div>
    </div>
  )
}

export default App
