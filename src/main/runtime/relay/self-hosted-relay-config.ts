import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { writeSecureJsonFile } from '../../../shared/secure-file'
import type {
  MobileRelayConfiguration,
  UpdateMobileRelayConfiguration
} from '../../../shared/mobile-relay-configuration'

type PersistedSelfHostedRelayConfig = {
  version: 1
  backend: 'orca' | 'self-hosted'
  serverUrl?: string
  accessTokenCiphertext?: string
  revision: number
  readError?: string
}

export type ActiveSelfHostedRelayConfig = {
  serverUrl: string
  accessToken: string
  revision: number
}

const FILE_NAME = 'mobile-relay-config.json'
const MIN_ACCESS_TOKEN_LENGTH = 32
const MAX_ACCESS_TOKEN_LENGTH = 8 * 1024

function configPath(userDataPath: string): string {
  return join(userDataPath, FILE_NAME)
}

function canonicalHttpsOrigin(value: string): string {
  const trimmed = value.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('invalid_self_hosted_relay_url')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('self_hosted_relay_url_must_be_https_origin')
  }
  return parsed.origin
}

function readPersisted(userDataPath: string): PersistedSelfHostedRelayConfig {
  const path = configPath(userDataPath)
  if (!existsSync(path)) {
    return { version: 1, backend: 'orca', revision: 0 }
  }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedSelfHostedRelayConfig>
    if (
      value.version !== 1 ||
      (value.backend !== 'orca' && value.backend !== 'self-hosted') ||
      !Number.isSafeInteger(value.revision) ||
      (value.revision ?? -1) < 0
    ) {
      throw new Error('invalid_self_hosted_relay_config')
    }
    return value as PersistedSelfHostedRelayConfig
  } catch {
    // Why: a broken private config must fail closed instead of silently selecting TeamRun Relay.
    return {
      version: 1,
      backend: 'self-hosted',
      revision: 0,
      readError: 'The saved Relay configuration could not be read.'
    }
  }
}

function encryptedStorageAvailable(): boolean {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  )
}

function decryptAccessToken(ciphertext: string | undefined): string | null {
  if (!ciphertext || !encryptedStorageAvailable()) {
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
  } catch {
    return null
  }
}

export function readMobileRelayConfiguration(userDataPath: string): MobileRelayConfiguration {
  const persisted = readPersisted(userDataPath)
  if (persisted.backend === 'orca') {
    return {
      backend: 'orca',
      serverUrl: null,
      configured: true,
      credentialStored: false,
      revision: persisted.revision
    }
  }
  const serverUrl = persisted.serverUrl ?? null
  const credentialStored = Boolean(persisted.accessTokenCiphertext)
  const accessToken = decryptAccessToken(persisted.accessTokenCiphertext)
  return {
    backend: 'self-hosted',
    serverUrl,
    configured: Boolean(serverUrl && accessToken),
    credentialStored,
    ...(persisted.readError
      ? { credentialError: persisted.readError }
      : !accessToken && credentialStored
        ? { credentialError: 'The saved Relay access key could not be decrypted.' }
        : {}),
    revision: persisted.revision
  }
}

export function readActiveSelfHostedRelayConfig(
  userDataPath: string
): ActiveSelfHostedRelayConfig | null {
  const persisted = readPersisted(userDataPath)
  if (persisted.backend !== 'self-hosted' || !persisted.serverUrl) {
    return null
  }
  const accessToken = decryptAccessToken(persisted.accessTokenCiphertext)
  return accessToken
    ? { serverUrl: persisted.serverUrl, accessToken, revision: persisted.revision }
    : null
}

export function saveMobileRelayConfiguration(
  userDataPath: string,
  update: UpdateMobileRelayConfiguration
): MobileRelayConfiguration {
  const current = readPersisted(userDataPath)
  const revision = current.revision + 1
  if (update.backend === 'orca') {
    writeSecureJsonFile(configPath(userDataPath), { version: 1, backend: 'orca', revision })
    return readMobileRelayConfiguration(userDataPath)
  }

  const serverUrl = canonicalHttpsOrigin(update.serverUrl)
  const accessToken = update.accessToken?.trim()
  const retainingCredential = !accessToken && current.serverUrl === serverUrl
  if (!accessToken && !retainingCredential) {
    throw new Error('self_hosted_relay_access_key_required')
  }
  if (
    accessToken &&
    (accessToken.length < MIN_ACCESS_TOKEN_LENGTH || accessToken.length > MAX_ACCESS_TOKEN_LENGTH)
  ) {
    throw new Error('self_hosted_relay_access_key_length_invalid')
  }
  if (accessToken && !encryptedStorageAvailable()) {
    throw new Error('self_hosted_relay_secure_storage_unavailable')
  }
  const accessTokenCiphertext = accessToken
    ? safeStorage.encryptString(accessToken).toString('base64')
    : current.accessTokenCiphertext
  writeSecureJsonFile(configPath(userDataPath), {
    version: 1,
    backend: 'self-hosted',
    serverUrl,
    accessTokenCiphertext,
    revision
  } satisfies PersistedSelfHostedRelayConfig)
  return readMobileRelayConfiguration(userDataPath)
}
