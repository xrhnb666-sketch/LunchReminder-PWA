export interface CheckinRequestErrorDetails {
  url: string
  method: string
  status: number | null
  responseText: string
  bodyStart: string
  bodyEnd: string
  name: string
  message: string
}

export class CheckinRequestError extends Error {
  details: CheckinRequestErrorDetails
  code?: string

  constructor(details: CheckinRequestErrorDetails, code?: string) {
    super(formatCheckinErrorDetails(details))
    this.name = 'CheckinRequestError'
    this.details = details
    this.code = code
  }
}

export const getCheckinErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

export const getCheckinErrorName = (error: unknown) => {
  if (error instanceof Error && error.name) return error.name
  return typeof error
}

export const formatCheckinErrorDetails = (details: CheckinRequestErrorDetails) => {
  const status = details.status === null ? 'network' : `${details.status}`
  const bodyDetails = details.bodyStart || details.bodyEnd
    ? ` bodyStart=${details.bodyStart} bodyEnd=${details.bodyEnd}`
    : ''
  return `${details.method} ${details.url} status=${status} message=${details.message}${bodyDetails}`
}

export const getCheckinErrorDetails = (
  error: unknown,
  fallback: string,
): CheckinRequestErrorDetails => {
  if (error instanceof CheckinRequestError) return error.details
  return {
    url: 'unknown',
    method: 'unknown',
    status: null,
    responseText: '',
    bodyStart: '',
    bodyEnd: '',
    name: getCheckinErrorName(error),
    message: getCheckinErrorMessage(error, fallback),
  }
}
