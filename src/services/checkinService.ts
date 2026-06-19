import type {
  CheckinActionResponse,
  CheckinHistoryResponse,
  CheckinTodayResponse,
  SkipReason,
} from '../types/checkin'
import type { MealType } from '../types/reminder'
import {
  CheckinRequestError,
  getCheckinErrorMessage,
  getCheckinErrorName,
} from './checkinErrors.ts'
import { parseApiResponse } from './apiResponse.ts'
import { getPushClientId, PushServiceError } from './pushService.ts'

const getApiUrl = () => {
  const apiUrl = import.meta.env.VITE_PUSH_API_URL as string | undefined
  if (!apiUrl) throw new PushServiceError('缺少 VITE_PUSH_API_URL')
  return apiUrl.replace(/\/$/, '')
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const url = `${getApiUrl()}${path}`
  const method = init?.method ?? 'GET'
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new CheckinRequestError({
      url,
      method,
      status: null,
      responseText: '',
      bodyStart: '',
      bodyEnd: '',
      name: getCheckinErrorName(error),
      message: getCheckinErrorMessage(error, 'Load failed'),
    })
  }

  return parseApiResponse<T>(response, url, method)
}

export const getLocalTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const getTodayCheckins = () => {
  const params = new URLSearchParams({ timezone: getLocalTimezone() })
  return requestJson<CheckinTodayResponse>(
    `/api/checkins/${getPushClientId()}/today?${params.toString()}`,
  )
}

export const getCheckinHistory = (from: string, to: string) => {
  const params = new URLSearchParams({ from, to })
  return requestJson<CheckinHistoryResponse>(
    `/api/checkins/${getPushClientId()}?${params.toString()}`,
  )
}

interface ActionBase {
  localDate: string
  mealType: MealType
  scheduledTime: string
}

export const completeMealCheckin = ({ localDate, mealType, scheduledTime }: ActionBase) =>
  requestJson<CheckinActionResponse>(
    `/api/checkins/${getPushClientId()}/${localDate}/${mealType}/action`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'complete',
        timezone: getLocalTimezone(),
        scheduledTime,
      }),
    },
  )

export const snoozeMealCheckin = ({
  localDate,
  mealType,
  scheduledTime,
  snoozeMinutes,
}: ActionBase & { snoozeMinutes: 10 | 20 | 30 }) =>
  requestJson<CheckinActionResponse>(
    `/api/checkins/${getPushClientId()}/${localDate}/${mealType}/action`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'snooze',
        timezone: getLocalTimezone(),
        scheduledTime,
        snoozeMinutes,
      }),
    },
  )

export const skipMealCheckin = ({
  localDate,
  mealType,
  scheduledTime,
  skipReason,
}: ActionBase & { skipReason: SkipReason }) =>
  requestJson<CheckinActionResponse>(
    `/api/checkins/${getPushClientId()}/${localDate}/${mealType}/action`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'skip',
        timezone: getLocalTimezone(),
        scheduledTime,
        skipReason,
      }),
    },
  )
