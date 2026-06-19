import type { MealType } from './reminder'

export type CheckinStatus = 'pending' | 'completed' | 'snoozed' | 'skipped'

export type SkipReason = 'already_ate' | 'not_hungry' | 'unwell' | 'inconvenient' | 'other'

export type CheckinAction = 'complete' | 'snooze' | 'skip'

export interface MealCheckin {
  _id: string
  version: 1
  clientId: string
  mealType: MealType
  localDate: string
  timezone: string
  scheduledTime: string
  status: CheckinStatus
  completedAt: string | null
  snoozedUntil: string | null
  snoozeMinutes: number | null
  snoozeDeliveredAt: string | null
  skipReason: SkipReason | null
  note: string | null
  firstReminderAt: string | null
  lastReminderAt: string | null
  reminderCount: number
  createdAt: string
  updatedAt: string
}

export interface CheckinTodayResponse {
  ok: true
  localDate?: string
  records: MealCheckin[]
}

export interface CheckinHistoryResponse {
  ok: true
  records: MealCheckin[]
}

export interface CheckinActionResponse {
  ok: true
  record: MealCheckin
}

export interface DeepLinkCheckinTarget {
  mealType: MealType
  localDate: string
}
