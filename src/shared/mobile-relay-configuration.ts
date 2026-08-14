export type MobileRelayBackend = 'orca' | 'self-hosted'

export type MobileRelayConfiguration = {
  backend: MobileRelayBackend
  serverUrl: string | null
  configured: boolean
  credentialStored: boolean
  credentialError?: string
  revision: number
}

export type UpdateMobileRelayConfiguration =
  | { backend: 'orca' }
  | {
      backend: 'self-hosted'
      serverUrl: string
      /** Omit to retain the saved access key for an unchanged server URL. */
      accessToken?: string
    }

export function isUpdateMobileRelayConfiguration(
  value: unknown
): value is UpdateMobileRelayConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  if (candidate.backend === 'orca') {
    return true
  }
  return (
    candidate.backend === 'self-hosted' &&
    typeof candidate.serverUrl === 'string' &&
    candidate.serverUrl.length > 0 &&
    candidate.serverUrl.length <= 2048 &&
    (candidate.accessToken === undefined ||
      (typeof candidate.accessToken === 'string' && candidate.accessToken.length <= 8 * 1024))
  )
}

export function isMobileRelayAvailable(
  configuration: MobileRelayConfiguration | null,
  signedInToOrca: boolean
): boolean {
  return configuration?.backend === 'self-hosted' ? configuration.configured : signedInToOrca
}

export function mobileRelayConfigurationKey(
  configuration: MobileRelayConfiguration | null,
  available: boolean
): string {
  return configuration
    ? `${configuration.backend}:${configuration.serverUrl ?? ''}:${configuration.revision}:${available}`
    : `loading:${available}`
}
