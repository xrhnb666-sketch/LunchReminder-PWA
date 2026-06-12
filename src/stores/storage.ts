import type { AppState, MealReminder, ReminderSettings } from '../types/reminder'
import { createDefaultSettings, createDefaultState, mealOrder } from '../utils/defaults'

export const STORAGE_KEY = 'lunchreminder:pwa:v1'

const isMealReminder = (value: unknown): value is Partial<MealReminder> =>
  typeof value === 'object' && value !== null

const normalizeMeal = (fallback: MealReminder, value: unknown): MealReminder => {
  if (!isMealReminder(value)) {
    return { ...fallback }
  }
  return {
    ...fallback,
    ...value,
    type: fallback.type,
    time: typeof value.time === 'string' ? value.time : fallback.time,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
  }
}

export const normalizeSettings = (value: unknown): ReminderSettings => {
  const defaults = createDefaultSettings()
  if (typeof value !== 'object' || value === null) {
    return defaults
  }

  const candidate = value as Partial<ReminderSettings>
  const settings: ReminderSettings = {
    ...defaults,
    ...candidate,
    version: 1,
    breakfast: normalizeMeal(defaults.breakfast, candidate.breakfast),
    lunch: normalizeMeal(defaults.lunch, candidate.lunch),
    dinner: normalizeMeal(defaults.dinner, candidate.dinner),
    weekdaysOnly:
      typeof candidate.weekdaysOnly === 'boolean' ? candidate.weekdaysOnly : defaults.weekdaysOnly,
    skippedDate:
      typeof candidate.skippedDate === 'string' || candidate.skippedDate === null
        ? candidate.skippedDate
        : defaults.skippedDate,
    themeMode:
      candidate.themeMode === 'light' || candidate.themeMode === 'dark' || candidate.themeMode === 'system'
        ? candidate.themeMode
        : defaults.themeMode,
    notificationMessages: { ...defaults.notificationMessages },
  }

  for (const mealType of mealOrder) {
    const messages = candidate.notificationMessages?.[mealType]
    settings.notificationMessages[mealType] =
      Array.isArray(messages) && messages.every((item) => typeof item === 'string')
        ? messages
        : defaults.notificationMessages[mealType]
  }

  return settings
}

export const loadAppState = (): AppState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createDefaultState()
    }
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      version: 1,
      settings: normalizeSettings(parsed.settings),
      history: Array.isArray(parsed.history) ? parsed.history : [],
    }
  } catch {
    return createDefaultState()
  }
}

export const saveAppState = (state: AppState) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
