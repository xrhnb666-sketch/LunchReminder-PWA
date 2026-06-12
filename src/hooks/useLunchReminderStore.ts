import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, MealType, ReminderSettings, ThemeMode } from '../types/reminder'
import { loadAppState, saveAppState } from '../stores/storage'
import { calculateNextReminder, getTodayKey } from '../utils/dateUtils'

type SaveStatus = 'idle' | 'saved'

export const useLunchReminderStore = () => {
  const [state, setState] = useState<AppState>(() => loadAppState())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveStatusTimer = useRef<number | null>(null)

  useEffect(() => {
    saveAppState(state)
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.themeMode
  }, [state.settings.themeMode])

  const markSaved = useCallback(() => {
    if (saveStatusTimer.current) {
      window.clearTimeout(saveStatusTimer.current)
    }
    setSaveStatus('saved')
    saveStatusTimer.current = window.setTimeout(() => setSaveStatus('idle'), 1200)
  }, [])

  const updateSettings = useCallback(
    (updater: (settings: ReminderSettings) => ReminderSettings) => {
      setState((current) => ({
        ...current,
        settings: updater(current.settings),
      }))
      markSaved()
    },
    [markSaved],
  )

  const setMealEnabled = useCallback(
    (mealType: MealType, enabled: boolean) => {
      updateSettings((settings) => ({
        ...settings,
        [mealType]: {
          ...settings[mealType],
          enabled,
        },
      }))
    },
    [updateSettings],
  )

  const setMealTime = useCallback(
    (mealType: MealType, time: string) => {
      updateSettings((settings) => ({
        ...settings,
        [mealType]: {
          ...settings[mealType],
          time,
        },
      }))
    },
    [updateSettings],
  )

  const setSkipToday = useCallback(
    (skipped: boolean) => {
      updateSettings((settings) => ({
        ...settings,
        skippedDate: skipped ? getTodayKey() : null,
      }))
    },
    [updateSettings],
  )

  const setWeekdaysOnly = useCallback(
    (weekdaysOnly: boolean) => {
      updateSettings((settings) => ({
        ...settings,
        weekdaysOnly,
      }))
    },
    [updateSettings],
  )

  const setThemeMode = useCallback(
    (themeMode: ThemeMode) => {
      updateSettings((settings) => ({
        ...settings,
        themeMode,
      }))
    },
    [updateSettings],
  )

  const nextReminder = useMemo(() => calculateNextReminder(state.settings), [state.settings])

  return {
    state,
    settings: state.settings,
    history: state.history,
    nextReminder,
    saveStatus,
    setMealEnabled,
    setMealTime,
    setSkipToday,
    setWeekdaysOnly,
    setThemeMode,
  }
}
