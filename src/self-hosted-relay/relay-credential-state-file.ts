import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { DeviceCredentialInstallAuthorization } from '../main/runtime/relay/relay-control-requests'

export type RelayInvite = {
  token: string
  relayHostId: string
  relayDeviceId: string
  expiresAt: number
  attempts: number
}

export type RelayResumeCredential = {
  relayHostId: string
  relayDeviceId: string
  currentHash: string
  currentVersion: number
  resumeExpiresAt: number
  graceHash?: string
  graceVersion?: number
  graceExpiresAt?: number
}

export type InstalledRelayCredential = {
  v: 1
  reqId: string
  authorizationMode: DeviceCredentialInstallAuthorization['mode']
  currentVersion: number
  resumeExpiresAt: number
  graceExpiresAt?: number
}

export type StoredInstall = {
  key: string
  savedAt: number
  result: InstalledRelayCredential
}

export type PersistedRelayState = {
  version: 1
  invites: RelayInvite[]
  credentials: RelayResumeCredential[]
  installs: StoredInstall[]
}

export function readRelayCredentialState(dataPath: string): PersistedRelayState | null {
  if (!existsSync(dataPath)) {
    return null
  }
  try {
    const state = JSON.parse(readFileSync(dataPath, 'utf8')) as PersistedRelayState
    if (
      state.version !== 1 ||
      !Array.isArray(state.invites) ||
      !Array.isArray(state.credentials) ||
      !Array.isArray(state.installs)
    ) {
      throw new Error('invalid_version')
    }
    return state
  } catch {
    throw new Error('self_hosted_relay_state_invalid')
  }
}

export function writeRelayCredentialState(dataPath: string, state: PersistedRelayState): void {
  mkdirSync(dirname(dataPath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${dataPath}.${randomBytes(8).toString('hex')}.tmp`
  try {
    writeFileSync(temporaryPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporaryPath, dataPath)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    throw error
  }
}
