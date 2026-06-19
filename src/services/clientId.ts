const CLIENT_ID_KEY = 'lunchreminder:push-client-id'
let cachedClientId: string | null = null

export const getStablePushClientId = (
  storage = window.localStorage,
  randomUuid = () => crypto.randomUUID(),
) => {
  if (cachedClientId) return cachedClientId
  const existing = storage.getItem(CLIENT_ID_KEY)
  if (existing) {
    cachedClientId = existing
    return existing
  }
  const clientId = randomUuid()
  storage.setItem(CLIENT_ID_KEY, clientId)
  cachedClientId = clientId
  return clientId
}

export const resetPushClientIdCacheForTest = () => {
  cachedClientId = null
}
