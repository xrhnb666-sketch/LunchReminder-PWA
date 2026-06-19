import type { DeepLinkCheckinTarget, MealCheckin } from '../types/checkin'
import type { MealType, ReminderSettings } from '../types/reminder'
import { isWeekday } from './weekday.ts'

const checkinMealOrder: MealType[] = ['breakfast', 'lunch', 'dinner']
const checkinStatusOrder = {
  pending: 0,
  snoozed: 1,
  skipped: 2,
  completed: 3,
} satisfies Record<MealCheckin['status'], number>

export type DeepLinkCheckinResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'today'; target: DeepLinkCheckinTarget }
  | { kind: 'expired'; target: DeepLinkCheckinTarget }

export const isCheckinDateKey = (value: string | null): value is string => {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const isCheckinMealType = (value: string | null): value is MealType =>
  value === 'breakfast' || value === 'lunch' || value === 'dinner'

export const parseCheckinDeepLink = (
  search: string,
  todayDate: string,
): DeepLinkCheckinResult => {
  const params = new URLSearchParams(search)
  const mealType = params.get('checkin')
  const localDate = params.get('date')
  if (!mealType && !localDate) return { kind: 'none' }
  if (!isCheckinMealType(mealType) || !isCheckinDateKey(localDate)) return { kind: 'invalid' }
  const target = { mealType, localDate }
  return localDate === todayDate ? { kind: 'today', target } : { kind: 'expired', target }
}

const timeHasArrived = (time: string, now: Date) => {
  const [hour = '0', minute = '0'] = time.split(':')
  const scheduled = new Date(now)
  scheduled.setHours(Number(hour), Number(minute), 0, 0)
  return now.getTime() >= scheduled.getTime()
}

export const getAutoOpenCheckinTarget = ({
  settings,
  todayByMeal,
  todayDate,
  now,
  openedKeys,
}: {
  settings: ReminderSettings
  todayByMeal: Partial<Record<MealType, MealCheckin>>
  todayDate: string
  now: Date
  openedKeys: ReadonlySet<string>
}): DeepLinkCheckinTarget | null => {
  if (settings.skippedDate === todayDate) return null
  if (settings.weekdaysOnly && !isWeekday(now)) return null
  for (const mealType of checkinMealOrder) {
    const meal = settings[mealType]
    const key = `${todayDate}:${mealType}`
    const record = todayByMeal[mealType]
    if (!meal.enabled || openedKeys.has(key)) continue
    if (record?.status === 'completed' || record?.status === 'skipped') continue
    if (timeHasArrived(meal.time, now)) return { mealType, localDate: todayDate }
  }
  return null
}

export const getCheckinRecordKey = (record: Pick<MealCheckin, '_id' | 'localDate' | 'mealType'>) =>
  record._id || `${record.localDate}:${record.mealType}`

const isKnownCheckinStatus = (status: MealCheckin['status']) =>
  Object.hasOwn(checkinStatusOrder, status)

const chooseStrongerRecord = (current: MealCheckin | undefined, next: MealCheckin) => {
  if (!current) return next
  const currentOrder = checkinStatusOrder[current.status] ?? -1
  const nextOrder = checkinStatusOrder[next.status] ?? -1
  if (nextOrder !== currentOrder) return nextOrder > currentOrder ? next : current
  return String(next.updatedAt ?? '') >= String(current.updatedAt ?? '') ? next : current
}

export const getMealStatusFromRecords = (
  records: readonly MealCheckin[],
  localDate: string,
  mealType: MealType,
) => {
  let matched: MealCheckin | undefined
  for (const record of records) {
    if (record.localDate !== localDate || record.mealType !== mealType || !isKnownCheckinStatus(record.status)) {
      continue
    }
    matched = chooseStrongerRecord(matched, record)
  }
  return matched
}

export const mergeTodayCheckinsIntoMeals = (
  records: readonly MealCheckin[],
  localDate: string,
) => {
  const byMeal: Partial<Record<MealType, MealCheckin>> = {}
  for (const mealType of checkinMealOrder) {
    const record = getMealStatusFromRecords(records, localDate, mealType)
    if (record) byMeal[mealType] = record
  }
  return byMeal
}

export const resolveTodayCheckinDate = (
  responseLocalDate: string | null | undefined,
  records: readonly MealCheckin[],
  fallbackDate: string,
) => {
  const candidateDate = responseLocalDate ?? null
  if (isCheckinDateKey(candidateDate)) return candidateDate
  const recordDate = records.find((record) => isCheckinDateKey(record.localDate))?.localDate
  return recordDate ?? fallbackDate
}

export interface HomeCheckinDebugInfo {
  todayDate: string
  clientIdPrefix: string
  todayRecordsLength: number
  lunchRecordStatus: string
  lunchRecordLocalDate: string
  lunchUiStatus: string
}

export const getHomeCheckinDebugInfo = ({
  todayDate,
  clientId,
  todayRecords,
  todayByMeal,
}: {
  todayDate: string
  clientId: string
  todayRecords: readonly MealCheckin[]
  todayByMeal: Partial<Record<MealType, MealCheckin>>
}): HomeCheckinDebugInfo => {
  const lunchRecord = todayRecords.find((record) => record.mealType === 'lunch')
  const lunchUiRecord = todayByMeal.lunch
  return {
    todayDate,
    clientIdPrefix: clientId.slice(0, 8),
    todayRecordsLength: todayRecords.length,
    lunchRecordStatus: lunchRecord?.status ?? 'none',
    lunchRecordLocalDate: lunchRecord?.localDate ?? 'none',
    lunchUiStatus: lunchUiRecord?.status ?? 'pending',
  }
}

export const upsertCheckinRecord = (
  records: readonly MealCheckin[],
  record: MealCheckin,
) => {
  const key = getCheckinRecordKey(record)
  const index = records.findIndex((item) => getCheckinRecordKey(item) === key)
  if (index === -1) return [...records, record]
  return records.map((item, itemIndex) => (itemIndex === index ? record : item))
}

export const groupHistoryCheckinsByDate = (records: readonly MealCheckin[]) => {
  const map = new Map<string, MealCheckin[]>()
  for (const record of records) {
    if (!isCheckinDateKey(record.localDate) || !isCheckinMealType(record.mealType) || !isKnownCheckinStatus(record.status)) {
      continue
    }
    const dayRecords = map.get(record.localDate) ?? []
    const merged = upsertCheckinRecord(dayRecords, record)
    map.set(record.localDate, merged)
  }
  return map
}

export const buildHistoryDisplayRows = (
  dates: readonly string[],
  records: readonly MealCheckin[],
) => {
  const recordsByDate = groupHistoryCheckinsByDate(records)
  return dates.map((localDate) => ({
    localDate,
    recordsByMeal: mergeTodayCheckinsIntoMeals(recordsByDate.get(localDate) ?? [], localDate),
  }))
}

export const applyHistoryLoadSuccess = (records: readonly MealCheckin[]): MealCheckin[] => [...records]

export const applyHistoryLoadFailure = (records: MealCheckin[]) => records
