/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string
    revision: string | null
  }>
}

interface PushPayload {
  title?: string
  body?: string
  icon?: string
  badge?: string
  tag?: string
  data?: {
    type?: string
    url?: string
    mealType?: string
    localDate?: string
    test?: boolean
  }
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  let payload: Required<Pick<PushPayload, 'title' | 'body' | 'icon' | 'badge' | 'tag'>> & Pick<PushPayload, 'data'> = {
    title: '三餐提醒空推送测试',
    body: '浏览器已收到无内容推送',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'lunch-reminder-empty-test',
    data: { url: '/' },
  }

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...(event.data.json() as PushPayload),
      }
    } catch {
      payload.body = event.data.text() || payload.body
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: {
        url: '/',
        ...payload.data,
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = event.notification.data?.url
  const targetPath = typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/'
  const targetUrl = new URL(targetPath, self.location.origin)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin) {
          return client.navigate(targetUrl.href).then((navigatedClient) => (navigatedClient ?? client).focus())
        }
      }
      return self.clients.openWindow(targetUrl.href)
    }),
  )
})
