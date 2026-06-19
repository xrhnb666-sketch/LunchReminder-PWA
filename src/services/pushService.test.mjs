import assert from 'node:assert/strict'
import test from 'node:test'
import { getStablePushClientId, resetPushClientIdCacheForTest } from './clientId.ts'

test('push client id is not rebuilt within one page session', () => {
  const writes = []
  const localStorage = {
    getItem: () => null,
    setItem: (_key, value) => {
      writes.push(value)
    },
  }

  resetPushClientIdCacheForTest()

  try {
    const first = getStablePushClientId(localStorage, () => 'client-1')
    const second = getStablePushClientId(localStorage, () => 'client-2')

    assert.equal(second, first)
    assert.equal(writes.length, 1)
  } finally {
    resetPushClientIdCacheForTest()
  }
})
