import { resolve } from 'node:path'
import { timingSafeEqual } from 'node:crypto'

export type SelfHostedRelayServerConfig = {
  publicUrl: string
  host: string
  port: number
  accessToken: string
  dataPath: string
  maxConnections: number
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`invalid_${name}`)
  }
  return parsed
}

function publicHttpsOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error('ORCA_RELAY_PUBLIC_URL is required')
  }
  const trimmed = value.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('ORCA_RELAY_PUBLIC_URL must be a valid URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('ORCA_RELAY_PUBLIC_URL must be a canonical HTTPS origin')
  }
  return parsed.origin
}

export function readSelfHostedRelayServerConfig(
  env: NodeJS.ProcessEnv = process.env
): SelfHostedRelayServerConfig {
  const accessToken = env.ORCA_RELAY_ACCESS_TOKEN?.trim()
  if (!accessToken || accessToken.length < 32 || accessToken.length > 8 * 1024) {
    throw new Error('ORCA_RELAY_ACCESS_TOKEN must contain 32 to 8192 characters')
  }
  return {
    publicUrl: publicHttpsOrigin(env.ORCA_RELAY_PUBLIC_URL),
    host: env.ORCA_RELAY_HOST?.trim() || '127.0.0.1',
    port: positiveInteger(env.ORCA_RELAY_PORT, 8787, 'relay_port'),
    accessToken,
    dataPath: resolve(env.ORCA_RELAY_DATA_PATH?.trim() || 'data/relay-state.json'),
    maxConnections: positiveInteger(env.ORCA_RELAY_MAX_CONNECTIONS, 128, 'relay_max_connections')
  }
}

export function relayAccessTokenMatches(expected: string, candidate: string | undefined): boolean {
  if (!candidate) {
    return false
  }
  const expectedBytes = Buffer.from(expected)
  const candidateBytes = Buffer.from(candidate)
  return (
    expectedBytes.byteLength === candidateBytes.byteLength &&
    timingSafeEqual(expectedBytes, candidateBytes)
  )
}
