export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type ThemeMode = 'system' | 'light' | 'dark'

export type HistoryStatus = 'scheduled' | 'delivered' | 'skipped'

export interface MealReminder {
  type: MealType
  time: string
  enabled: boolean
  title: string
  subtitle: string
  icon: string
}

export interface ReminderSettings {
  version: 1
  breakfast: MealReminder
  lunch: MealReminder
  dinner: MealReminder
  weekdaysOnly: boolean
  skippedDate: string | null
  themeMode: ThemeMode
  notificationMessages: Record<MealType, string[]>
}

export interface HistoryRecord {
  id: string
  mealType: MealType
  scheduledAt: string
  createdAt: string
  title: string
  status: HistoryStatus
}

export interface AppState {
  version: 1
  settings: ReminderSettings
  history: HistoryRecord[]
}

export interface NextReminder {
  mealType: MealType
  title: string
  date: Date
}

export type AppPage = 'home' | 'history' | 'statistics' | 'settings'
