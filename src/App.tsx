import { useCallback, useEffect, useState } from 'react'
import { BottomNavigation } from './components/BottomNavigation'
import { SplashScreen } from './components/SplashScreen'
import { StatusToasts } from './components/StatusToasts'
import { useCheckins } from './hooks/useCheckins'
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
  const [deepLinkSearch] = useState(() => window.location.search)
  const online = useNetworkStatus()
  const updateAvailable = usePwaUpdateStatus()
  const store = useLunchReminderStore()
  const push = usePushNotifications(store.settings)
  const checkins = useCheckins(store.settings)
  const { refreshHistory } = checkins
  const handleHistoryRangeChange = useCallback(
    (days: 7 | 30) => {
      void refreshHistory(days)
    },
    [refreshHistory],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSplash(false), 800)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (currentPage === 'statistics') {
      void refreshHistory(30)
    }
  }, [currentPage, refreshHistory])

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
            todayDate={checkins.todayDate}
            todayByMeal={checkins.todayByMeal}
            pendingAction={checkins.pendingAction}
            deepLinkSearch={deepLinkSearch}
            actionMessage={checkins.message}
            actionError={checkins.actionError}
            todayError={checkins.todayError}
            onMealEnabledChange={store.setMealEnabled}
            onMealTimeChange={store.setMealTime}
            onSkipTodayChange={store.setSkipToday}
            onComplete={(mealType, localDate) => void checkins.submitComplete(mealType, localDate)}
            onSnooze={(mealType, minutes, localDate) => void checkins.submitSnooze(mealType, minutes, localDate)}
            onSkipMeal={(mealType, reason, localDate) => void checkins.submitSkip(mealType, reason, localDate)}
          />
        )}
        {currentPage === 'history' && (
          <HistoryPage
            records={checkins.historyRecords}
            loading={checkins.historyLoading}
            error={checkins.historyError}
            onRangeChange={handleHistoryRangeChange}
          />
        )}
        {currentPage === 'statistics' && <StatisticsPage records={checkins.historyRecords} />}
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
