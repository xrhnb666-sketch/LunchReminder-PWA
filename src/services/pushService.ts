import type { ReminderSettings } from '../types/reminder'
import { isIOS, isStandaloneMode } from '../utils/dateUtils'

const CLIENT_ID_KEY = 'lunchreminder:push-client-id'

interface SubscriptionDiagnostics {
  exists: boolean
  endpointHost?: string
  endpointFingerprint?: string
  p256dhFingerprint?: string
  authFingerprint?: string
  p256dhLength?: number
  authLength?: number
  contentEncodings?: string[]
  updatedAt?: string
}

export interface PushDiagnosticsComparison {
  endpointMatches: boolean
  p256dhMatches: boolean
  authMatches: boolean
  applicationServerKeyMatches: boolean
  workerDiagnostics: SubscriptionDiagnostics
}

export class PushServiceError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'PushServiceError'
    this.code = code
  }
}

const pushErrorMessages: Record<string, string> = {
  push_subscription_expired: '推送订阅已失效，请关闭后重新启用推送',
  push_authentication_failed: '推送身份验证失败，请检查服务器推送密钥',
  push_rate_limited: '测试过于频繁，请稍后再试',
  vapid_config_missing: '服务器推送配置不完整',
  invalid_subscription: '浏览器推送订阅无效，请重新启用',
  push_delivery_failed: '测试通知发送失败，请稍后重试',
  internal_error: '服务暂时开小差了，请稍后重试',
}

export const getPushErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof PushServiceError) return error.message
  if (error instanceof Error) return error.message
  return fallback
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

const supportedContentEncodings = () => {
  const pushManager = PushManager as typeof PushManager & { supportedContentEncodings?: readonly string[] }
  return Array.from(pushManager.supportedContentEncodings ?? [])
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

const arrayBufferToBase64Url = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fingerprintValue = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
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
    const code = data.error || `http_${response.status}`
    throw new PushServiceError(pushErrorMessages[code] || `请求失败：${response.status}`, code)
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
      contentEncodings: supportedContentEncodings(),
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
  requestJson<{ ok: true; pushServiceStatus: number; testType: 'payload' }>(`/api/subscriptions/${getPushClientId()}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  })

export const requestEmptyTestPush = async () =>
  requestJson<{ ok: true; pushServiceStatus: number; testType: 'empty' }>(
    `/api/subscriptions/${getPushClientId()}/test-empty`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )

export const diagnosePushSubscription = async (): Promise<PushDiagnosticsComparison> => {
  const subscription = await getExistingPushSubscription()
  if (!subscription) throw new PushServiceError('当前浏览器没有可诊断的推送订阅', 'invalid_subscription')
  const subscriptionJson = subscription.toJSON()
  const endpoint = subscriptionJson.endpoint
  const p256dh = subscriptionJson.keys?.p256dh
  const auth = subscriptionJson.keys?.auth
  if (!endpoint || !p256dh || !auth) throw new PushServiceError('浏览器推送订阅无效，请重新启用', 'invalid_subscription')

  const [endpointFingerprint, p256dhFingerprint, authFingerprint, publicKey] = await Promise.all([
    fingerprintValue(endpoint),
    fingerprintValue(p256dh),
    fingerprintValue(auth),
    getVapidPublicKey(),
  ])
  const workerDiagnostics = await requestJson<SubscriptionDiagnostics>(
    `/api/subscriptions/${getPushClientId()}/diagnostics`,
  )
  const applicationServerKey = subscription.options.applicationServerKey
  const applicationServerKeyMatches = applicationServerKey
    ? arrayBufferToBase64Url(applicationServerKey) === publicKey
    : false

  return {
    endpointMatches: endpointFingerprint === workerDiagnostics.endpointFingerprint,
    p256dhMatches: p256dhFingerprint === workerDiagnostics.p256dhFingerprint,
    authMatches: authFingerprint === workerDiagnostics.authFingerprint,
    applicationServerKeyMatches,
    workerDiagnostics,
  }
}
