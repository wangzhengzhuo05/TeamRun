import type { TeamRunAuthStatus } from '../../../../shared/teamrun-cloud'

const INVALID_AUTH_STATUS_MESSAGE =
  'Team Space received an invalid response. Update the TeamRun server and try again.'

export function normalizeTeamRunAuthStatus(value: unknown): TeamRunAuthStatus {
  if (!value || typeof value !== 'object') {
    return invalidAuthStatus()
  }
  const status = value as Record<string, unknown>
  if (
    typeof status.apiUrl !== 'string' ||
    typeof status.devAuth !== 'boolean' ||
    typeof status.sharedKeyAuth !== 'boolean'
  ) {
    return invalidAuthStatus()
  }
  if (status.state === 'signed-in') {
    if (typeof status.email !== 'string' && status.email !== null) {
      return invalidAuthStatus()
    }
    if (
      status.userId !== undefined &&
      typeof status.userId !== 'string' &&
      status.userId !== null
    ) {
      return invalidAuthStatus()
    }
    return {
      state: 'signed-in',
      apiUrl: status.apiUrl,
      devAuth: status.devAuth,
      sharedKeyAuth: status.sharedKeyAuth,
      email: status.email,
      userId: typeof status.userId === 'string' ? status.userId : null
    }
  }
  if (status.state === 'signed-out' || status.state === 'unconfigured') {
    return {
      state: status.state,
      apiUrl: status.apiUrl,
      devAuth: status.devAuth,
      sharedKeyAuth: status.sharedKeyAuth
    }
  }
  if (status.state === 'error' && typeof status.message === 'string') {
    return {
      state: 'error',
      apiUrl: status.apiUrl,
      devAuth: status.devAuth,
      sharedKeyAuth: status.sharedKeyAuth,
      message: status.message
    }
  }
  return invalidAuthStatus()
}

function invalidAuthStatus(): TeamRunAuthStatus {
  return {
    state: 'error',
    apiUrl: '',
    devAuth: false,
    sharedKeyAuth: false,
    message: INVALID_AUTH_STATUS_MESSAGE
  }
}
