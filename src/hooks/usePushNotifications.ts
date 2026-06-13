import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReminderSettings } from '../types/reminder'
import {
  PushServiceError,
  createPushSubscription,
  deletePushSubscription,
  getExistingPushSubscription,
  getPushErrorMessage,
  getPushSupportIssue,
  requestTestPush,
  syncPushSettings,
  uploadSubscription,
} from '../services/pushService'

export type PushStatus =
  | 'checking'
  | 'unsupported'
  | 'needs-install'
  | 'disabled'
  | 'requesting'
  | 'enabled'
  | 'denied'
  | 'sync-failed'

export const usePushNotifications = (settings: ReminderSettings) => {
  const [status, setStatus] = useState<PushStatus>('checking')
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)

  const supportIssue = useMemo(() => getPushSupportIssue(), [])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (supportIssue) {
        setStatus(supportIssue.includes('主屏幕') ? 'needs-install' : 'unsupported')
        setMessage(supportIssue)
        return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied')
        setMessage('通知权限已被拒绝，请在浏览器设置中允许通知。')
        return
      }
      const subscription = await getExistingPushSubscription()
      if (!cancelled) {
        setStatus(subscription ? 'enabled' : 'disabled')
        setMessage(subscription ? '推送已启用' : '尚未启用')
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [supportIssue])

  const enablePush = useCallback(async () => {
    try {
      if (supportIssue) throw new PushServiceError(supportIssue)
      setStatus('requesting')
      setMessage('正在请求通知权限...')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'disabled')
        setMessage(permission === 'denied' ? '通知权限已被拒绝' : '通知权限尚未开启')
        return
      }
      const existing = await getExistingPushSubscription()
      const subscription = existing ?? (await createPushSubscription())
      await uploadSubscription(settings, subscription)
      setStatus('enabled')
      setMessage('推送已启用')
    } catch (error) {
      setStatus('sync-failed')
      setMessage(getPushErrorMessage(error, '启用推送失败'))
    }
  }, [settings, supportIssue])

  const syncSettings = useCallback(async () => {
    try {
      setSyncing(true)
      await syncPushSettings(settings)
      setStatus('enabled')
      setMessage('云端提醒已同步')
    } catch (error) {
      setStatus('sync-failed')
      setMessage(getPushErrorMessage(error, '云端提醒同步失败'))
    } finally {
      setSyncing(false)
    }
  }, [settings])

  const disablePush = useCallback(async () => {
    try {
      await deletePushSubscription()
      setStatus('disabled')
      setMessage('推送已关闭')
    } catch (error) {
      setStatus('sync-failed')
      setMessage(getPushErrorMessage(error, '关闭推送失败'))
    }
  }, [])

  const sendTest = useCallback(async () => {
    try {
      await requestTestPush()
      setStatus('enabled')
      setMessage('测试通知已发送')
    } catch (error) {
      setStatus('sync-failed')
      setMessage(getPushErrorMessage(error, '测试通知发送失败'))
    }
  }, [])

  useEffect(() => {
    if (status !== 'enabled') return undefined
    const timeout = window.setTimeout(() => {
      void syncSettings()
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [settings, status, syncSettings])

  return {
    status,
    message,
    syncing,
    enablePush,
    disablePush,
    sendTest,
    syncSettings,
  }
}
