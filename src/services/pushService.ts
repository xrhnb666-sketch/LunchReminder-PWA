import type { ReminderSettings } from '../types/reminder'
import { isIOS, isStandaloneMode } from '../utils/dateUtils'

const CLIENT_ID_KEY = 'lunchreminder:push-client-id'

export class PushServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushServiceError'
  }
}

const getApiUrl = () => {
  const apiUrl = import.meta.env.VITE_PUSH_API_URL as string | undefined
  if (!apiUrl) throw new PushServiceError('缺少 VITE_PUSH_API_URL')
  return apiUrl.replace(/\/$/, '')
}

export const getPushClientId = () => {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing
  const clientId = crypto.randomUUID()
  window.localStorage.setItem(CLIENT_ID_KEY, clientId)
  return clientId
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }
  return outputArray
}

export const getPushSupportIssue = () => {
  if (!('serviceWorker' in navigator)) return '当前浏览器不支持 Service Worker'
  if (!('PushManager' in window)) return '当前浏览器不支持 Push 推送'
  if (!('Notification' in window)) return '当前浏览器不支持通知'
  if (isIOS() && !isStandaloneMode()) return '需要先添加到 iPhone 主屏幕'
  return null
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new PushServiceError(data.error || `请求失败：${response.status}`)
  }
  return data as T
}

export const getVapidPublicKey = async () => {
  const data = await requestJson<{ publicKey: string }>('/api/vapid-public-key')
  return data.publicKey
}

export const getExistingPushSubscription = async () => {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export const createPushSubscription = async () => {
  const registration = await navigator.serviceWorker.ready
  const publicKey = await getVapidPublicKey()
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const uploadSubscription = async (settings: ReminderSettings, subscription: PushSubscription) =>
  requestJson<{ ok: true; clientId: string }>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      clientId: getPushClientId(),
      subscription: subscription.toJSON(),
      timezone: timezone(),
      settings,
    }),
  })

export const syncPushSettings = async (settings: ReminderSettings) =>
  requestJson<{ ok: true }>(`/api/subscriptions/${getPushClientId()}/settings`, {
    method: 'PUT',
    body: JSON.stringify({
      timezone: timezone(),
      settings,
    }),
  })

export const deletePushSubscription = async () => {
  const subscription = await getExistingPushSubscription()
  await subscription?.unsubscribe()
  return requestJson<{ ok: true }>(`/api/subscriptions/${getPushClientId()}`, {
    method: 'DELETE',
  })
}

export const requestTestPush = async () =>
  requestJson<{ ok: true }>(`/api/subscriptions/${getPushClientId()}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
