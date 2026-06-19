import {
  CheckinRequestError,
  getCheckinErrorMessage,
  getCheckinErrorName,
} from './checkinErrors.ts'

const bodySnippetLength = 300

const getBodySnippets = (responseText: string) => ({
  bodyStart: responseText.slice(0, bodySnippetLength),
  bodyEnd: responseText.slice(Math.max(0, responseText.length - bodySnippetLength)),
})

export const parseApiResponse = async <T>(
  response: Response,
  url: string,
  method: string,
): Promise<T> => {
  const responseText = await response.text().catch(() => '')
  const bodySnippets = getBodySnippets(responseText)
  let data: unknown = {}

  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch (error) {
      throw new CheckinRequestError({
        url,
        method,
        status: response.status,
        responseText,
        ...bodySnippets,
        name: getCheckinErrorName(error),
        message: `JSON parse failed: ${getCheckinErrorMessage(error, 'invalid JSON')}`,
      })
    }
  } else if (response.ok) {
    return {} as T
  }

  const errorCode = typeof data === 'object' && data && 'error' in data ? String(data.error) : undefined
  if (!response.ok) {
    throw new CheckinRequestError({
      url,
      method,
      status: response.status,
      responseText,
      ...bodySnippets,
      name: 'HTTPError',
      message: errorCode || `HTTP ${response.status}`,
    }, errorCode)
  }
  return data as T
}
