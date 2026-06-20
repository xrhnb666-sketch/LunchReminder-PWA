import assert from 'node:assert/strict'
import test from 'node:test'
import { getCheckinStats } from './checkinStats.ts'

const makeRecord = (overrides = {}) => ({
  _id: 'client-1_2026-06-20_lunch',
  version: 1,
  clientId: 'client-1',
  mealType: 'lunch',
  localDate: '2026-06-20',
  timezone: 'Asia/Shanghai',
  scheduledTime: '12:00',
  status: 'completed',
  completedAt: '2026-06-20T04:00:00.000Z',
  snoozedUntil: null,
  snoozeMinutes: null,
  snoozeDeliveredAt: null,
  skipReason: null,
  note: null,
  firstReminderAt: null,
  lastReminderAt: null,
  reminderCount: 0,
  createdAt: '2026-06-20T04:00:00.000Z',
  updatedAt: '2026-06-20T04:00:00.000Z',
  ...overrides,
})

const now = new Date(2026, 5, 20, 12, 0)

test('three completed records on 2026-06-20 generate non-empty stats', () => {
  const stats = getCheckinStats([
    makeRecord({ mealType: 'breakfast', _id: 'client-1_2026-06-20_breakfast' }),
    makeRecord({ mealType: 'lunch', _id: 'client-1_2026-06-20_lunch' }),
    makeRecord({ mealType: 'dinner', _id: 'client-1_2026-06-20_dinner' }),
  ], now)

  assert.equal(stats.hasData, true)
  assert.equal(stats.last7.completed, 3)
  assert.equal(stats.last7.completionRate, 100)
  assert.equal(stats.last7.activeDays, 1)
  assert.deepEqual(stats.completedByMeal, { breakfast: 1, lunch: 1, dinner: 1 })
})

test('last 7 days filter uses localDate', () => {
  const stats = getCheckinStats([
    makeRecord({ localDate: '2026-06-20' }),
    makeRecord({ localDate: '2026-06-14', _id: 'client-1_2026-06-14_lunch' }),
    makeRecord({ localDate: '2026-06-13', _id: 'client-1_2026-06-13_lunch' }),
  ], now)

  assert.equal(stats.last7.total, 2)
  assert.equal(stats.last7.completed, 2)
})

test('last 30 days filter uses localDate', () => {
  const stats = getCheckinStats([
    makeRecord({ localDate: '2026-06-20' }),
    makeRecord({ localDate: '2026-05-22', _id: 'client-1_2026-05-22_lunch' }),
    makeRecord({ localDate: '2026-05-21', _id: 'client-1_2026-05-21_lunch' }),
  ], now)

  assert.equal(stats.last30.total, 2)
  assert.equal(stats.last30.completed, 2)
})

test('pending records do not count as completed', () => {
  const stats = getCheckinStats([
    makeRecord({ status: 'pending', completedAt: null }),
    makeRecord({ mealType: 'dinner', _id: 'client-1_2026-06-20_dinner' }),
  ], now)

  assert.equal(stats.last7.total, 2)
  assert.equal(stats.last7.completed, 1)
  assert.equal(stats.last7.pending, 1)
  assert.equal(stats.last7.completionRate, 50)
})

test('skipped records keep stats non-empty but do not count as completed', () => {
  const stats = getCheckinStats([
    makeRecord({ status: 'skipped', completedAt: null, skipReason: 'other' }),
  ], now)

  assert.equal(stats.hasData, true)
  assert.equal(stats.last7.total, 1)
  assert.equal(stats.last7.completed, 0)
  assert.equal(stats.last7.skipped, 1)
})

test('only empty records show empty stats', () => {
  const stats = getCheckinStats([], now)

  assert.equal(stats.hasData, false)
  assert.equal(stats.last7.total, 0)
  assert.equal(stats.last30.total, 0)
})
