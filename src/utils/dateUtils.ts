import type { HistoryRecord, NextReminder, ReminderSettings } from '../types/reminder'
import { mealLabels, mealOrder } from './defaults'

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const isWeekday = (date: Date) => {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

const parseTimeOnDate = (date: Date, time: string) => {
  const [hour = '0', minute = '0'] = time.split(':')
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number(hour),
    Number(minute),
    0,
    0,
  )
}

export const getTodayKey = () => toDateKey(new Date())

export const shouldSkipDate = (date: Date, settings: ReminderSettings) => {
  if (settings.weekdaysOnly && !isWeekday(date)) {
    return true
  }
  return settings.skippedDate === toDateKey(date)
}

export const calculateNextReminder = (
  settings: ReminderSettings,
  now = new Date(),
): NextReminder | null => {
  const candidates: NextReminder[] = []
  const today = startOfDay(now)

  for (let offset = 0; offset < 45; offset += 1) {
    const day = addDays(today, offset)
    if (shouldSkipDate(day, settings)) {
      continue
    }

    for (const mealType of mealOrder) {
      const meal = settings[mealType]
      if (!meal.enabled) {
        continue
      }
      const date = parseTimeOnDate(day, meal.time)
      if (date > now) {
        candidates.push({
          mealType,
          title: mealLabels[mealType],
          date,
        })
      }
    }
  }

  return candidates.sort((left, right) => left.date.getTime() - right.date.getTime())[0] ?? null
}

export const formatTime = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

export const formatNextDate = (date: Date, now = new Date()) => {
  const dateKey = toDateKey(date)
  const tomorrowKey = toDateKey(addDays(startOfDay(now), 1))
  if (dateKey === toDateKey(now)) {
    return `今天 ${formatTime(date)}`
  }
  if (dateKey === tomorrowKey) {
    return `明天 ${formatTime(date)}`
  }
  return `${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)} ${formatTime(date)}`
}

export const getHistoryStats = (history: HistoryRecord[], now = new Date()) => {
  const delivered = history.filter((item) => item.status === 'delivered')
  const todayKey = toDateKey(now)
  const weekStart = startOfDay(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const month = now.getMonth()
  const year = now.getFullYear()
  const counts = {
    today: 0,
    week: 0,
    month: 0,
    total: delivered.length,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    streakDays: 0,
  }

  const daySet = new Set<string>()
  for (const item of delivered) {
    const date = new Date(item.scheduledAt)
    const key = toDateKey(date)
    daySet.add(key)
    if (key === todayKey) counts.today += 1
    if (date >= weekStart && date <= now) counts.week += 1
    if (date.getFullYear() === year && date.getMonth() === month) counts.month += 1
    counts[item.mealType] += 1
  }

  let cursor = startOfDay(now)
  while (daySet.has(toDateKey(cursor))) {
    counts.streakDays += 1
    cursor = addDays(cursor, -1)
  }

  return counts
}

export const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in window.navigator && window.navigator.standalone === true)

export const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent)
