import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CheckinRequestError,
  formatCheckinErrorDetails,
  getCheckinErrorDetails,
} from './checkinErrors.ts'
import { parseApiResponse } from './apiResponse.ts'

test('checkin request errors preserve url status and message for display', () => {
  const details = {
    url: 'https://example.com/api/checkins/client-1?from=2026-06-13&to=2026-06-19',
    method: 'GET',
    status: 502,
    responseText: '{"error":"bad_gateway"}',
    bodyStart: '{"error":"bad_gateway"}',
    bodyEnd: '{"error":"bad_gateway"}',
    name: 'HTTPError',
    message: 'bad_gateway',
  }
  const error = new CheckinRequestError(details, 'bad_gateway')
  const preserved = getCheckinErrorDetails(error, 'history_load_failed')
  const display = formatCheckinErrorDetails(preserved)

  assert.equal(preserved.url, details.url)
  assert.equal(preserved.status, 502)
  assert.equal(preserved.message, 'bad_gateway')
  assert.match(display, /GET https:\/\/example\.com\/api\/checkins\/client-1/)
  assert.match(display, /status=502/)
  assert.match(display, /message=bad_gateway/)
})

test('plain fetch failures keep the original error name and message', () => {
  const details = getCheckinErrorDetails(new TypeError('Load failed'), 'history_load_failed')

  assert.equal(details.url, 'unknown')
  assert.equal(details.method, 'unknown')
  assert.equal(details.status, null)
  assert.equal(details.bodyStart, '')
  assert.equal(details.bodyEnd, '')
  assert.equal(details.name, 'TypeError')
  assert.equal(details.message, 'Load failed')
})

test('api response parser parses the complete body instead of the display snippet', async () => {
  const longNote = 'x'.repeat(900)
  const body = JSON.stringify({ ok: true, records: [{ note: longNote }] })
  const data = await parseApiResponse(
    new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
    'https://example.com/api/checkins/client-1?from=2026-06-13&to=2026-06-19',
    'GET',
  )

  assert.equal(data.ok, true)
  assert.equal(data.records[0].note.length, 900)
})

test('json parse failures preserve url status and body edge snippets', async () => {
  const body = `{"ok":true,"records":[{"note":"${'x'.repeat(700)}`
  await assert.rejects(
    parseApiResponse(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      'https://example.com/api/checkins/client-1?from=2026-06-13&to=2026-06-19',
      'GET',
    ),
    (error) => {
      assert.equal(error instanceof CheckinRequestError, true)
      const details = error.details
      const display = formatCheckinErrorDetails(details)
      assert.equal(details.status, 200)
      assert.equal(details.responseText, body)
      assert.equal(details.bodyStart, body.slice(0, 300))
      assert.equal(details.bodyEnd, body.slice(body.length - 300))
      assert.match(details.message, /JSON parse failed/)
      assert.match(display, /bodyStart=/)
      assert.match(display, /bodyEnd=/)
      return true
    },
  )
})

test('empty successful response is handled explicitly', async () => {
  const data = await parseApiResponse(
    new Response('', { status: 200 }),
    'https://example.com/api/empty',
    'GET',
  )

  assert.deepEqual(data, {})
})
