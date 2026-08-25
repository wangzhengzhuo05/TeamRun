import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFile } from '../../shared/secure-file'

export type TeamRunSession =
  | { mode: 'dev'; email: string }
  | { mode: 'shared-key'; apiUrl: string; accessKey: string; email: string | null }
  | {
      mode: 'oidc'
      accessToken: string
      refreshToken: string | null
      expiresAt: number
      email: string | null
      tokenEndpoint: string
      clientId: string
    }

type EncryptedSession = {
  version: 1
  format: 'electron-safe-storage-v1'
  ciphertext: string
}

type DevSession = {
  version: 1
  format: 'dev-plaintext-v1'
  session: Extract<TeamRunSession, { mode: 'dev' }>
}

let memorySession: TeamRunSession | null | undefined

function sessionPath(userDataPath = app.getPath('userData')): string {
  return join(userDataPath, 'teamrun', 'account-session.json.enc')
}

function isSession(value: unknown): value is TeamRunSession {
  if (!value || typeof value !== 'object') {
    return false
  }
  const session = value as Record<string, unknown>
  if (session.mode === 'dev') {
    return typeof session.email === 'string' && session.email.length > 0
  }
  if (session.mode === 'shared-key') {
    return (
      typeof session.apiUrl === 'string' &&
      typeof session.accessKey === 'string' &&
      session.accessKey.length >= 24 &&
      (typeof session.email === 'string' || session.email === null)
    )
  }
  return (
    session.mode === 'oidc' &&
    typeof session.accessToken === 'string' &&
    (typeof session.refreshToken === 'string' || session.refreshToken === null) &&
    typeof session.expiresAt === 'number' &&
    (typeof session.email === 'string' || session.email === null) &&
    typeof session.tokenEndpoint === 'string' &&
    typeof session.clientId === 'string'
  )
}

function allowDevPlaintext(): boolean {
  return !app.isPackaged && process.env.TEAMRUN_DEV_AUTH === '1'
}

export function saveTeamRunSession(session: TeamRunSession): void {
  memorySession = session
  if (safeStorage.isEncryptionAvailable()) {
    const persisted: EncryptedSession = {
      version: 1,
      format: 'electron-safe-storage-v1',
      ciphertext: safeStorage.encryptString(JSON.stringify(session)).toString('base64')
    }
    writeSecureJsonFile(sessionPath(), persisted)
    return
  }
  if (session.mode === 'dev' && allowDevPlaintext()) {
    const persisted: DevSession = { version: 1, format: 'dev-plaintext-v1', session }
    writeSecureJsonFile(sessionPath(), persisted)
  }
}

export function readTeamRunSession(): TeamRunSession | null {
  if (memorySession !== undefined) {
    return memorySession
  }
  const path = sessionPath()
  if (!existsSync(path)) {
    memorySession = null
    return null
  }
  try {
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as EncryptedSession | DevSession
    let candidate: unknown = null
    if (persisted.version === 1 && persisted.format === 'electron-safe-storage-v1') {
      if (!safeStorage.isEncryptionAvailable()) {
        return null
      }
      candidate = JSON.parse(safeStorage.decryptString(Buffer.from(persisted.ciphertext, 'base64')))
    } else if (
      persisted.version === 1 &&
      persisted.format === 'dev-plaintext-v1' &&
      allowDevPlaintext()
    ) {
      candidate = persisted.session
    }
    memorySession = isSession(candidate) ? candidate : null
  } catch {
    memorySession = null
  }
  return memorySession
}

export function clearTeamRunSession(): void {
  memorySession = null
  rmSync(sessionPath(), { force: true })
}
