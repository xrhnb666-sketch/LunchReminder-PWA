import { useEffect, useMemo, useRef, useState } from 'react'
import { MealActionPanel } from '../components/MealActionPanel'
import { MealCard } from '../components/MealCard'
import { ReminderCard } from '../components/ReminderCard'
import { SkipReasonDialog } from '../components/SkipReasonDialog'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { formatCheckinErrorDetails, type CheckinRequestErrorDetails } from '../services/checkinErrors'
import type { MealCheckin, SkipReason } from '../types/checkin'
import type { MealType, NextReminder, ReminderSettings } from '../types/reminder'
import { assets } from '../utils/assets'
import { getAutoOpenCheckinTarget, parseCheckinDeepLink } from '../utils/checkinUi'
import { getTodayKey } from '../utils/dateUtils'
import { mealOrder } from '../utils/defaults'

interface HomePageProps {
  settings: ReminderSettings
  nextReminder: NextReminder | null
  todayDate: string
  todayByMeal: Partial<Record<MealType, MealCheckin>>
  pendingAction: string | null
  deepLinkSearch: string
  actionMessage: string | null
  actionError: CheckinRequestErrorDetails | null
  todayError: CheckinRequestErrorDetails | null
  onMealEnabledChange: (mealType: MealType, enabled: boolean) => void
  onMealTimeChange: (mealType: MealType, time: string) => void
  onSkipTodayChange: (skipped: boolean) => void
  onComplete: (mealType: MealType, localDate?: string) => void
  onSnooze: (mealType: MealType, minutes: 10 | 20 | 30, localDate?: string) => void
  onSkipMeal: (mealType: MealType, reason: SkipReason, localDate?: string) => void
}

export const HomePage = ({
  settings,
  nextReminder,
  todayDate,
  todayByMeal,
  pendingAction,
  deepLinkSearch,
  actionMessage,
  actionError,
  todayError,
  onMealEnabledChange,
  onMealTimeChange,
  onSkipTodayChange,
  onComplete,
  onSnooze,
  onSkipMeal,
}: HomePageProps) => {
  const skippedToday = settings.skippedDate === getTodayKey()
  const deepLink = useMemo(() => parseCheckinDeepLink(deepLinkSearch, todayDate), [deepLinkSearch, todayDate])
  const initialDeepLinkTarget = deepLink.kind === 'today' ? deepLink.target : null
  const [activeMeal, setActiveMeal] = useState<MealType | null>(initialDeepLinkTarget?.mealType ?? null)
  const [activeDate, setActiveDate] = useState(initialDeepLinkTarget?.localDate ?? todayDate)
  const [skipDialogMeal, setSkipDialogMeal] = useState<MealType | null>(null)
  const openedKeys = useRef<Set<string>>(new Set(initialDeepLinkTarget ? [`${initialDeepLinkTarget.localDate}:${initialDeepLinkTarget.mealType}`] : []))

  const activeRecord = activeMeal ? todayByMeal[activeMeal] : undefined
  const actionDisabled = pendingAction !== null
  const visibleError = actionError ?? todayError

  useEffect(() => {
    const target = getAutoOpenCheckinTarget({
      settings,
      todayByMeal,
      todayDate,
      now: new Date(),
      openedKeys: openedKeys.current,
    })
    if (!target) return undefined
    const timeout = window.setTimeout(() => {
      openedKeys.current.add(`${target.localDate}:${target.mealType}`)
      setActiveMeal(target.mealType)
      setActiveDate(target.localDate)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [settings, todayByMeal, todayDate])

  return (
    <main className="page home-page">
      <header className="page-header home-header">
        <div>
          <h1>三餐提醒</h1>
          <p>按时吃饭，照顾自己</p>
        </div>
        <img src={assets.plant} alt="" />
      </header>

      {(actionMessage || visibleError) && (
        <section className={`checkin-feedback ${visibleError ? 'is-error' : ''}`} aria-live="polite">
          {visibleError ? formatCheckinErrorDetails(visibleError) : actionMessage}
        </section>
      )}

      {deepLink.kind === 'expired' && (
        <section className="checkin-feedback" aria-live="polite">
          该提醒已过期，可在历史记录中查看。
        </section>
      )}

      <section className="meal-list" aria-label="三餐提醒设置">
        {mealOrder.map((mealType) => (
          <MealCard
            key={mealType}
            meal={settings[mealType]}
            skippedToday={skippedToday}
            checkin={todayByMeal[mealType]}
            onTimeChange={(time) => onMealTimeChange(mealType, time)}
            onEnabledChange={(enabled) => onMealEnabledChange(mealType, enabled)}
            onOpenCheckin={() => {
              setActiveMeal(mealType)
              setActiveDate(todayDate)
            }}
          />
        ))}
      </section>

      {activeMeal && (
        <MealActionPanel
          meal={settings[activeMeal]}
          localDate={activeDate}
          record={activeRecord}
          disabled={actionDisabled}
          onComplete={() => onComplete(activeMeal, activeDate)}
          onSnooze={(minutes) => onSnooze(activeMeal, minutes, activeDate)}
          onSkip={() => setSkipDialogMeal(activeMeal)}
          onClose={() => {
            openedKeys.current.add(`${activeDate}:${activeMeal}`)
            setActiveMeal(null)
          }}
        />
      )}

      <SkipReasonDialog
        open={skipDialogMeal !== null}
        disabled={actionDisabled}
        onClose={() => setSkipDialogMeal(null)}
        onSelect={(reason) => {
          if (!skipDialogMeal) return
          onSkipMeal(skipDialogMeal, reason, activeDate)
          setSkipDialogMeal(null)
        }}
      />

      <section className="skip-card">
        <img src={assets.skipCloud} alt="" />
        <div>
          <h2>今日跳过全部</h2>
          <p>开启后今天不再提醒</p>
        </div>
        <ToggleSwitch
          checked={skippedToday}
          label="今日跳过全部"
          onChange={onSkipTodayChange}
        />
      </section>

      <ReminderCard nextReminder={nextReminder} skippedToday={skippedToday} />
    </main>
  )
}
