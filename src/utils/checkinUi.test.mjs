import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyHistoryLoadFailure,
  buildHistoryDisplayRows,
  getAutoOpenCheckinTarget,
  getHomeCheckinDebugInfo,
  getMealStatusFromRecords,
  mergeTodayCheckinsIntoMeals,
  parseCheckinDeepLink,
  resolveTodayCheckinDate,
} from './checkinUi.ts'

const settings = {
  version: 1,
  breakfast: { type: 'breakfast', time: '08:00', enabled: true, title: 'breakfast', subtitle: '', icon: '' },
  lunch: { type: 'lunch', time: '12:00', enabled: true, title: 'lunch', subtitle: '', icon: '' },
  dinner: { type: 'dinner', time: '18:00', enabled: true, title: 'dinner', subtitle: '', icon: '' },
  weekdaysOnly: false,
  skippedDate: null,
  themeMode: 'system',
  notificationMessages: { breakfast: [], lunch: [], dinner: [] },
}

const makeRecord = (overrides = {}) => ({
  _id: 'client-1_2026-06-19_lunch',
  version: 1,
  clientId: 'client-1',
  mealType: 'lunch',
  localDate: '2026-06-19',
  timezone: 'Asia/Shanghai',
  scheduledTime: '12:00',
  status: 'completed',
  completedAt: '2026-06-18T17:45:50.599Z',
  snoozedUntil: null,
  snoozeMinutes: null,
  snoozeDeliveredAt: null,
  skipReason: null,
  note: null,
  firstReminderAt: null,
  lastReminderAt: null,
  reminderCount: 0,
  createdAt: '2026-06-18T17:45:50.599Z',
  updatedAt: '2026-06-18T17:45:50.599Z',
  ...overrides,
})

test('today deep link opens target and expired deep link does not', () => {
  assert.deepEqual(parseCheckinDeepLink('?checkin=lunch&date=2026-06-16', '2026-06-16'), {
    kind: 'today',
    target: { mealType: 'lunch', localDate: '2026-06-16' },
  })
  assert.deepEqual(parseCheckinDeepLink('?checkin=lunch&date=2026-06-15', '2026-06-16'), {
    kind: 'expired',
    target: { mealType: 'lunch', localDate: '2026-06-15' },
  })
  assert.equal(parseCheckinDeepLink('?checkin=snack&date=2026-06-16', '2026-06-16').kind, 'invalid')
})

test('deep link rejects impossible dates and accepts leap day', () => {
  assert.equal(parseCheckinDeepLink('?checkin=lunch&date=2026-02-31', '2026-02-28').kind, 'invalid')
  assert.equal(parseCheckinDeepLink('?checkin=lunch&date=2026-04-31', '2026-04-30').kind, 'invalid')
  assert.equal(parseCheckinDeepLink('?checkin=lunch&date=2025-02-29', '2025-02-28').kind, 'invalid')
  assert.deepEqual(parseCheckinDeepLink('?checkin=lunch&date=2024-02-29', '2024-02-29'), {
    kind: 'today',
    target: { mealType: 'lunch', localDate: '2024-02-29' },
  })
})

test('auto open chooses arrived enabled meal once per session key', () => {
  const target = getAutoOpenCheckinTarget({
    settings,
    todayByMeal: {},
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys: new Set(),
  })
  assert.deepEqual(target, { mealType: 'breakfast', localDate: '2026-06-16' })
  const reopened = getAutoOpenCheckinTarget({
    settings,
    todayByMeal: {},
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys: new Set(['2026-06-16:breakfast']),
  })
  assert.equal(reopened, null)
})

test('auto open does not repeat after panel close records opened key', () => {
  const openedKeys = new Set()
  const target = getAutoOpenCheckinTarget({
    settings,
    todayByMeal: {},
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys,
  })
  assert.deepEqual(target, { mealType: 'breakfast', localDate: '2026-06-16' })
  openedKeys.add(`${target.localDate}:${target.mealType}`)
  assert.equal(getAutoOpenCheckinTarget({
    settings,
    todayByMeal: {},
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys,
  }), null)
})

test('auto open skips completed or skipped records and skipped day', () => {
  const completed = getAutoOpenCheckinTarget({
    settings,
    todayByMeal: { breakfast: { status: 'completed' } },
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys: new Set(),
  })
  assert.equal(completed, null)
  const skipped = getAutoOpenCheckinTarget({
    settings,
    todayByMeal: { breakfast: { status: 'skipped' } },
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys: new Set(),
  })
  assert.equal(skipped, null)
  const skippedDay = getAutoOpenCheckinTarget({
    settings: { ...settings, skippedDate: '2026-06-16' },
    todayByMeal: {},
    todayDate: '2026-06-16',
    now: new Date(2026, 5, 16, 8, 5),
    openedKeys: new Set(),
  })
  assert.equal(skippedDay, null)
})

test('auto open respects weekdaysOnly on weekends', () => {
  const target = getAutoOpenCheckinTarget({
    settings: { ...settings, weekdaysOnly: true },
    todayByMeal: {},
    todayDate: '2026-06-14',
    now: new Date(2026, 5, 14, 8, 5),
    openedKeys: new Set(),
  })
  assert.equal(target, null)
})

test('today records map lunch completed skipped and snoozed statuses', () => {
  const completed = mergeTodayCheckinsIntoMeals([makeRecord()], '2026-06-19')
  assert.equal(completed.lunch.status, 'completed')
  assert.equal(completed.lunch.completedAt, '2026-06-18T17:45:50.599Z')

  const skipped = mergeTodayCheckinsIntoMeals([
    makeRecord({ status: 'skipped', completedAt: null, skipReason: 'other' }),
  ], '2026-06-19')
  assert.equal(skipped.lunch.status, 'skipped')
  assert.equal(skipped.lunch.skipReason, 'other')

  const snoozedUntil = '2026-06-19T04:20:00.000Z'
  const snoozed = mergeTodayCheckinsIntoMeals([
    makeRecord({ status: 'snoozed', completedAt: null, snoozedUntil, snoozeMinutes: 20 }),
  ], '2026-06-19')
  assert.equal(snoozed.lunch.status, 'snoozed')
  assert.equal(snoozed.lunch.snoozedUntil, snoozedUntil)
})

test('today response without top-level localDate still maps lunch completed into home data', () => {
  const records = [makeRecord()]
  const todayDate = resolveTodayCheckinDate(undefined, records, '2026-06-18')
  const byMeal = mergeTodayCheckinsIntoMeals(records, todayDate)
  assert.equal(todayDate, '2026-06-19')
  assert.equal(byMeal.lunch.status, 'completed')
})

test('today success and history failure keep home lunch completed diagnostics', () => {
  const records = [makeRecord()]
  const todayDate = resolveTodayCheckinDate(undefined, records, '2026-06-18')
  const todayByMeal = mergeTodayCheckinsIntoMeals(records, todayDate)
  const failedHistoryRecords = applyHistoryLoadFailure([])
  const debugInfo = getHomeCheckinDebugInfo({
    todayDate,
    clientId: '1fca0baf-0e7d-4a6f-885b-178abe3b4e63',
    todayRecords: records,
    todayByMeal,
  })

  assert.equal(todayByMeal.lunch.status, 'completed')
  assert.equal(failedHistoryRecords.length, 0)
  assert.equal(debugInfo.clientIdPrefix, '1fca0baf')
  assert.equal(debugInfo.todayRecordsLength, 1)
  assert.equal(debugInfo.lunchRecordStatus, 'completed')
  assert.equal(debugInfo.lunchRecordLocalDate, '2026-06-19')
  assert.equal(debugInfo.lunchUiStatus, 'completed')
})

test('empty today records leave meals pending in the UI layer', () => {
  const byMeal = mergeTodayCheckinsIntoMeals([], '2026-06-19')
  assert.equal(byMeal.lunch, undefined)
})

test('completed and skipped records are not overwritten by default pending records', () => {
  const completed = getMealStatusFromRecords([
    makeRecord({ status: 'completed', updatedAt: '2026-06-19T01:00:00.000Z' }),
    makeRecord({ status: 'pending', completedAt: null, updatedAt: '2026-06-19T02:00:00.000Z' }),
  ], '2026-06-19', 'lunch')
  assert.equal(completed.status, 'completed')

  const skipped = getMealStatusFromRecords([
    makeRecord({ status: 'skipped', completedAt: null, skipReason: 'other', updatedAt: '2026-06-19T01:00:00.000Z' }),
    makeRecord({ status: 'pending', completedAt: null, updatedAt: '2026-06-19T02:00:00.000Z' }),
  ], '2026-06-19', 'lunch')
  assert.equal(skipped.status, 'skipped')
})

test('today mapping isolates localDate and mealType', () => {
  const byMeal = mergeTodayCheckinsIntoMeals([
    makeRecord({ localDate: '2026-06-18', status: 'completed' }),
    makeRecord({ mealType: 'breakfast', status: 'skipped', completedAt: null, skipReason: 'other' }),
  ], '2026-06-19')
  assert.equal(byMeal.lunch, undefined)
  assert.equal(byMeal.breakfast.status, 'skipped')
})

test('history rows show 2026-06-19 lunch completed', () => {
  const rows = buildHistoryDisplayRows(['2026-06-19'], [makeRecord()])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].localDate, '2026-06-19')
  assert.equal(rows[0].recordsByMeal.lunch.status, 'completed')
})

test('empty history records produce true empty meal rows', () => {
  const rows = buildHistoryDisplayRows(['2026-06-19'], [])
  assert.equal(rows[0].recordsByMeal.breakfast, undefined)
  assert.equal(rows[0].recordsByMeal.lunch, undefined)
  assert.equal(rows[0].recordsByMeal.dinner, undefined)
})

test('history load failure keeps existing records', () => {
  const records = [makeRecord()]
  const afterFailure = applyHistoryLoadFailure(records)
  assert.equal(afterFailure, records)
  assert.equal(afterFailure[0].status, 'completed')
})

test('repeated history display mapping is stable', () => {
  const records = [
    makeRecord(),
    makeRecord({ mealType: 'dinner', _id: 'client-1_2026-06-19_dinner', status: 'skipped', completedAt: null, skipReason: 'other' }),
  ]
  const first = buildHistoryDisplayRows(['2026-06-19'], records)
  const second = buildHistoryDisplayRows(['2026-06-19'], records)
  assert.deepEqual(second, first)
})
