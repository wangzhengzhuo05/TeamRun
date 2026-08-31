import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { writeCredentialFileAtomic } from '../integration-credential-file'

export type TeamServerModelConnectionSecret = {
  baseUrl: string
  apiKey: string
  model: string
}

type StoredSecret =
  | { v: 1; cipher: 'safe-storage'; value: string }
  | { v: 1; cipher: 'aes-256-gcm'; iv: string; tag: string; value: string }

export class TeamServerModelConnectionStore {
  readonly #directory: string

  constructor(userDataPath: string) {
    this.#directory = join(userDataPath, 'team-server-model-connections')
  }

  encryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() || environmentKey() !== null
  }

  save(connectionId: string, secret: TeamServerModelConnectionSecret): void {
    const payload = Buffer.from(JSON.stringify(secret), 'utf8')
    const stored = safeStorage.isEncryptionAvailable()
      ? safeStorageSecret(payload)
      : environmentEncryptedSecret(payload)
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 })
    writeCredentialFileAtomic(this.#path(connectionId), Buffer.from(JSON.stringify(stored), 'utf8'))
  }

  read(connectionId: string): TeamServerModelConnectionSecret | null {
    const path = this.#path(connectionId)
    if (!existsSync(path)) {
      return null
    }
    try {
      const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredSecret
      const plaintext =
        stored.cipher === 'safe-storage'
          ? safeStorage.decryptString(Buffer.from(stored.value, 'base64'))
          : decryptEnvironmentSecret(stored).toString('utf8')
      return parseSecret(plaintext)
    } catch {
      throw new Error('team_server_model_connection_decryption_failed')
    }
  }

  #path(connectionId: string): string {
    return join(this.#directory, `${Buffer.from(connectionId).toString('base64url')}.enc`)
  }
}

function safeStorageSecret(value: Buffer): StoredSecret {
  return {
    v: 1,
    cipher: 'safe-storage',
    value: safeStorage.encryptString(value.toString('utf8')).toString('base64')
  }
}

function environmentEncryptedSecret(value: Buffer): StoredSecret {
  const key = environmentKey()
  if (!key) {
    throw new Error('team_server_model_encryption_unavailable')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()])
  return {
    v: 1,
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    value: encrypted.toString('base64url')
  }
}

function decryptEnvironmentSecret(
  stored: Extract<StoredSecret, { cipher: 'aes-256-gcm' }>
): Buffer {
  const key = environmentKey()
  if (!key) {
    throw new Error('team_server_model_encryption_unavailable')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(stored.tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(stored.value, 'base64url')), decipher.final()])
}

function environmentKey(): Buffer | null {
  const value = process.env.TEAMRUN_MODEL_CONNECTION_KEY
  if (!value) {
    return null
  }
  const key = Buffer.from(value, 'base64')
  return key.length === 32 ? key : null
}

function parseSecret(value: string): TeamServerModelConnectionSecret {
  const parsed = JSON.parse(value) as Partial<TeamServerModelConnectionSecret>
  if (
    typeof parsed.apiKey !== 'string' ||
    typeof parsed.baseUrl !== 'string' ||
    typeof parsed.model !== 'string'
  ) {
    throw new Error('team_server_model_connection_invalid')
  }
  return { apiKey: parsed.apiKey, baseUrl: parsed.baseUrl, model: parsed.model }
}
