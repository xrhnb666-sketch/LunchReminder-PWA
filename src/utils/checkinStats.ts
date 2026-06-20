import type { MealCheckin } from '../types/checkin'
import type { MealType } from '../types/reminder'

export interface CheckinRangeStats {
  total: number
  completed: number
  skipped: number
  pending: number
  snoozed: number
  completionRate: number
  activeDays: number
}

export interface CheckinStats {
  hasData: boolean
  last7: CheckinRangeStats
  last30: CheckinRangeStats
  completedByMeal: Record<MealType, number>
}

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']

const emptyRangeStats = (): CheckinRangeStats => ({
  total: 0,
  completed: 0,
  skipped: 0,
  pending: 0,
  snoozed: 0,
  completionRate: 0,
  activeDays: 0,
})

const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const toDateKey = (date: Date) => {
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

const getRangeStart = (now: Date, days: 7 | 30) => toDateKey(addDays(now, -(days - 1)))

const getRangeStats = (records: readonly MealCheckin[], now: Date, days: 7 | 30): CheckinRangeStats => {
  const from = getRangeStart(now, days)
  const to = toDateKey(now)
  const stats = emptyRangeStats()
  const activeDates = new Set<string>()

  for (const record of records) {
    if (!isDateKey(record.localDate) || record.localDate < from || record.localDate > to) continue
    stats.total += 1
    if (record.status === 'completed') {
      stats.completed += 1
      activeDates.add(record.localDate)
    } else if (record.status === 'skipped') {
      stats.skipped += 1
      activeDates.add(record.localDate)
    } else if (record.status === 'snoozed') {
      stats.snoozed += 1
    } else {
      stats.pending += 1
    }
  }

  stats.activeDays = activeDates.size
  stats.completionRate = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100)
  return stats
}

export const getCheckinStats = (
  records: readonly MealCheckin[],
  now = new Date(),
): CheckinStats => {
  const last7 = getRangeStats(records, now, 7)
  const last30 = getRangeStats(records, now, 30)
  const completedByMeal = Object.fromEntries(mealTypes.map((mealType) => [mealType, 0])) as Record<MealType, number>
  const from30 = getRangeStart(now, 30)
  const to = toDateKey(now)

  for (const record of records) {
    if (
      record.status === 'completed' &&
      mealTypes.includes(record.mealType) &&
      isDateKey(record.localDate) &&
      record.localDate >= from30 &&
      record.localDate <= to
    ) {
      completedByMeal[record.mealType] += 1
    }
  }

  return {
    hasData: last30.total > 0,
    last7,
    last30,
    completedByMeal,
  }
}
