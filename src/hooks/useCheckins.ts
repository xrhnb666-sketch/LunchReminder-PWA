import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MealCheckin, SkipReason } from '../types/checkin'
import type { MealType, ReminderSettings } from '../types/reminder'
import { type CheckinRequestErrorDetails, getCheckinErrorDetails } from '../services/checkinErrors'
import {
  completeMealCheckin,
  getCheckinHistory,
  getTodayCheckins,
  skipMealCheckin,
  snoozeMealCheckin,
} from '../services/checkinService'
import { getPushClientId } from '../services/pushService'
import {
  applyHistoryLoadFailure,
  applyHistoryLoadSuccess,
  getHomeCheckinDebugInfo,
  mergeTodayCheckinsIntoMeals,
  resolveTodayCheckinDate,
  upsertCheckinRecord,
} from '../utils/checkinUi'

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const getDefaultHistoryRange = (days: 7 | 30) => {
  const today = new Date()
  return {
    from: toLocalDateKey(addDays(today, -(days - 1))),
    to: toLocalDateKey(today),
  }
}

export const useCheckins = (settings: ReminderSettings) => {
  const [clientId] = useState(() => getPushClientId())
  const [todayDate, setTodayDate] = useState(() => toLocalDateKey(new Date()))
  const [todayRecords, setTodayRecords] = useState<MealCheckin[]>([])
  const [historyRecords, setHistoryRecords] = useState<MealCheckin[]>([])
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<CheckinRequestErrorDetails | null>(null)
  const [todayError, setTodayError] = useState<CheckinRequestErrorDetails | null>(null)
  const [historyError, setHistoryError] = useState<CheckinRequestErrorDetails | null>(null)

  const todayByMeal = useMemo(
    () => mergeTodayCheckinsIntoMeals(todayRecords, todayDate),
    [todayDate, todayRecords],
  )

  const debugInfo = useMemo(
    () => getHomeCheckinDebugInfo({ todayDate, clientId, todayRecords, todayByMeal }),
    [clientId, todayByMeal, todayDate, todayRecords],
  )

  const refreshToday = useCallback(async () => {
    setLoading(true)
    setTodayError(null)
    try {
      const result = await getTodayCheckins()
      setTodayDate((currentDate) => resolveTodayCheckinDate(result.localDate, result.records, currentDate))
      setTodayRecords(result.records)
    } catch (requestError) {
      setTodayError(getCheckinErrorDetails(requestError, '读取打卡状态失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshHistory = useCallback(async (days: 7 | 30) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const range = getDefaultHistoryRange(days)
      const result = await getCheckinHistory(range.from, range.to)
      setHistoryRecords(applyHistoryLoadSuccess(result.records))
    } catch (requestError) {
      setHistoryError(getCheckinErrorDetails(requestError, 'history_load_failed'))
      setHistoryRecords((records) => applyHistoryLoadFailure(records))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const submitComplete = useCallback(
    async (mealType: MealType, localDate = todayDate) => {
      setPendingAction(`${mealType}:complete`)
      setActionError(null)
      try {
        const result = await completeMealCheckin({
          localDate,
          mealType,
          scheduledTime: settings[mealType].time,
        })
        setTodayRecords((records) => upsertCheckinRecord(records, result.record))
        setHistoryRecords((records) => upsertCheckinRecord(records, result.record))
        setMessage('已记录，记得慢慢吃。')
        await refreshToday()
      } catch (requestError) {
        setActionError(getCheckinErrorDetails(requestError, '提交打卡失败'))
      } finally {
        setPendingAction(null)
      }
    },
    [refreshToday, settings, todayDate],
  )

  const submitSnooze = useCallback(
    async (mealType: MealType, snoozeMinutes: 10 | 20 | 30, localDate = todayDate) => {
      setPendingAction(`${mealType}:snooze:${snoozeMinutes}`)
      setActionError(null)
      try {
        const result = await snoozeMealCheckin({
          localDate,
          mealType,
          scheduledTime: settings[mealType].time,
          snoozeMinutes,
        })
        setTodayRecords((records) => upsertCheckinRecord(records, result.record))
        setHistoryRecords((records) => upsertCheckinRecord(records, result.record))
        setMessage(`${snoozeMinutes} 分钟后再提醒你。`)
        await refreshToday()
      } catch (requestError) {
        setActionError(getCheckinErrorDetails(requestError, '设置稍后提醒失败'))
      } finally {
        setPendingAction(null)
      }
    },
    [refreshToday, settings, todayDate],
  )

  const submitSkip = useCallback(
    async (mealType: MealType, skipReason: SkipReason, localDate = todayDate) => {
      setPendingAction(`${mealType}:skip`)
      setActionError(null)
      try {
        const result = await skipMealCheckin({
          localDate,
          mealType,
          scheduledTime: settings[mealType].time,
          skipReason,
        })
        setTodayRecords((records) => upsertCheckinRecord(records, result.record))
        setHistoryRecords((records) => upsertCheckinRecord(records, result.record))
        setMessage('已跳过本餐。')
        await refreshToday()
      } catch (requestError) {
        setActionError(getCheckinErrorDetails(requestError, '跳过本餐失败'))
      } finally {
        setPendingAction(null)
      }
    },
    [refreshToday, settings, todayDate],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshToday()
      void refreshHistory(7)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [refreshHistory, refreshToday])

  useEffect(() => {
    if (!message && !actionError) return undefined
    const timeout = window.setTimeout(() => {
      setMessage(null)
      setActionError(null)
    }, 2200)
    return () => window.clearTimeout(timeout)
  }, [actionError, message])

  return {
    clientId,
    todayDate,
    todayRecords,
    todayByMeal,
    debugInfo,
    historyRecords,
    loading,
    historyLoading,
    todayError,
    historyError,
    pendingAction,
    message,
    actionError,
    refreshToday,
    refreshHistory,
    submitComplete,
    submitSnooze,
    submitSkip,
  }
}
