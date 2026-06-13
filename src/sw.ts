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
    url?: string
    mealType?: string
    test?: boolean
  }
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  const fallback: Required<Pick<PushPayload, 'title' | 'body' | 'icon' | 'badge' | 'tag'>> = {
    title: '三餐提醒',
    body: '记得按时吃饭～',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'lunch-reminder',
  }

  const payload: PushPayload = (() => {
    try {
      return (event.data?.json() as PushPayload) ?? {}
    } catch {
      return {}
    }
  })()

  event.waitUntil(
    self.registration.showNotification(payload.title || fallback.title, {
      body: payload.body || fallback.body,
      icon: payload.icon || fallback.icon,
      badge: payload.badge || fallback.badge,
      tag: payload.tag || fallback.tag,
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
  const targetUrl = typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin) {
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
