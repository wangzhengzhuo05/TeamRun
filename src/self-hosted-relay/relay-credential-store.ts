import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DeviceCredentialInstallAuthorization } from '../main/runtime/relay/relay-control-requests'
import {
  type InstalledRelayCredential,
  type PersistedRelayState,
  readRelayCredentialState,
  type RelayInvite,
  type RelayResumeCredential,
  type StoredInstall,
  writeRelayCredentialState
} from './relay-credential-state-file'
export type { InstalledRelayCredential } from './relay-credential-state-file'

export type AuthorizedRelayCredential =
  | { kind: 'invite'; relayDeviceId: string; inviteExpiresAt: number }
  | {
      kind: 'resume'
      relayDeviceId: string
      acceptedCredentialVersion: number
      acceptedAs: 'current' | 'grace'
      resumeExpiresAt: number
      graceExpiresAt?: number
    }

const INVITE_TTL_MS = 10 * 60_000
const INVITE_MAX_ATTEMPTS = 6
const RESUME_TTL_MS = 30 * 24 * 60 * 60_000
const GRACE_TTL_MS = 24 * 60 * 60_000
const INSTALL_RETENTION_MS = 45 * 24 * 60 * 60_000

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

function credentialHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function hashesMatch(left: string | undefined, right: string): boolean {
  if (!left) {
    return false
  }
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes)
}

function credentialKey(relayHostId: string, relayDeviceId: string): string {
  return `${relayHostId}\0${relayDeviceId}`
}

function installKey(relayHostId: string, relayDeviceId: string, reqId: string): string {
  return `${credentialKey(relayHostId, relayDeviceId)}\0${reqId}`
}

export class RelayCredentialStore {
  private readonly dataPath: string
  private readonly invites = new Map<string, RelayInvite>()
  private readonly credentials = new Map<string, RelayResumeCredential>()
  private readonly installs = new Map<string, StoredInstall>()

  constructor(dataPath: string) {
    this.dataPath = dataPath
    this.load()
  }

  createInvite(relayHostId: string, relayDeviceId: string, now = Date.now()): RelayInvite {
    this.prune(now)
    const invite: RelayInvite = {
      token: randomToken(),
      relayHostId,
      relayDeviceId,
      expiresAt: now + INVITE_TTL_MS,
      attempts: 0
    }
    this.invites.set(invite.token, invite)
    this.persist()
    return invite
  }

  authorize(
    relayHostId: string,
    token: string,
    now = Date.now(),
    consumeInviteAttempt = true
  ): AuthorizedRelayCredential | null {
    const invite = this.invites.get(token)
    if (invite && invite.relayHostId === relayHostId) {
      if (!consumeInviteAttempt) {
        return invite.expiresAt > now && invite.attempts < INVITE_MAX_ATTEMPTS
          ? {
              kind: 'invite',
              relayDeviceId: invite.relayDeviceId,
              inviteExpiresAt: invite.expiresAt
            }
          : null
      }
      invite.attempts += 1
      const accepted = invite.expiresAt > now && invite.attempts <= INVITE_MAX_ATTEMPTS
      if (!accepted) {
        this.invites.delete(token)
      }
      this.persist()
      return accepted
        ? {
            kind: 'invite',
            relayDeviceId: invite.relayDeviceId,
            inviteExpiresAt: invite.expiresAt
          }
        : null
    }

    const hash = credentialHash(token)
    for (const credential of this.credentials.values()) {
      if (credential.relayHostId !== relayHostId) {
        continue
      }
      if (hashesMatch(credential.currentHash, hash) && credential.resumeExpiresAt > now) {
        return {
          kind: 'resume',
          relayDeviceId: credential.relayDeviceId,
          acceptedCredentialVersion: credential.currentVersion,
          acceptedAs: 'current',
          resumeExpiresAt: credential.resumeExpiresAt,
          graceExpiresAt: credential.graceExpiresAt
        }
      }
      if (
        hashesMatch(credential.graceHash, hash) &&
        credential.graceVersion &&
        credential.graceExpiresAt &&
        credential.graceExpiresAt > now
      ) {
        return {
          kind: 'resume',
          relayDeviceId: credential.relayDeviceId,
          acceptedCredentialVersion: credential.graceVersion,
          acceptedAs: 'grace',
          resumeExpiresAt: credential.resumeExpiresAt,
          graceExpiresAt: credential.graceExpiresAt
        }
      }
    }
    return null
  }

  install(args: {
    relayHostId: string
    relayDeviceId: string
    reqId: string
    newResumeTokenHash: string
    expectedCurrentHash?: string
    authorization: DeviceCredentialInstallAuthorization
    now?: number
  }): InstalledRelayCredential {
    const now = args.now ?? Date.now()
    const resultKey = installKey(args.relayHostId, args.relayDeviceId, args.reqId)
    const existingResult = this.installs.get(resultKey)
    if (existingResult) {
      return existingResult.result
    }
    const key = credentialKey(args.relayHostId, args.relayDeviceId)
    const current = this.credentials.get(key)
    if (args.expectedCurrentHash && current?.currentHash !== args.expectedCurrentHash) {
      throw new Error('relay_credential_conflict')
    }
    const graceExpiresAt = current ? now + GRACE_TTL_MS : undefined
    const credential: RelayResumeCredential = {
      relayHostId: args.relayHostId,
      relayDeviceId: args.relayDeviceId,
      currentHash: args.newResumeTokenHash,
      currentVersion: (current?.currentVersion ?? 0) + 1,
      resumeExpiresAt: now + RESUME_TTL_MS,
      ...(current
        ? {
            graceHash: current.currentHash,
            graceVersion: current.currentVersion,
            graceExpiresAt
          }
        : {})
    }
    this.credentials.set(key, credential)
    const result: InstalledRelayCredential = {
      v: 1,
      reqId: args.reqId,
      authorizationMode: args.authorization.mode,
      currentVersion: credential.currentVersion,
      resumeExpiresAt: credential.resumeExpiresAt,
      ...(graceExpiresAt ? { graceExpiresAt } : {})
    }
    this.installs.set(resultKey, { key: resultKey, savedAt: now, result })
    this.prune(now)
    this.persist()
    return result
  }

  installStatus(
    relayHostId: string,
    relayDeviceId: string,
    reqId: string
  ): InstalledRelayCredential | null {
    return this.installs.get(installKey(relayHostId, relayDeviceId, reqId))?.result ?? null
  }

  confirmResume(args: {
    relayHostId: string
    relayDeviceId: string
    reqId: string
    acceptedAs: 'current' | 'grace'
    now?: number
  }): {
    v: 1
    reqId: string
    currentVersion: number
    acceptedAs: 'current' | 'grace'
    renewed: boolean
    resumeExpiresAt: number
    graceExpiresAt?: number
  } {
    const now = args.now ?? Date.now()
    const key = credentialKey(args.relayHostId, args.relayDeviceId)
    const credential = this.credentials.get(key)
    if (!credential) {
      throw new Error('relay_resume_credential_not_found')
    }
    const renewed = args.acceptedAs === 'current'
    if (renewed) {
      credential.resumeExpiresAt = now + RESUME_TTL_MS
      this.persist()
    }
    return {
      v: 1,
      reqId: args.reqId,
      currentVersion: credential.currentVersion,
      acceptedAs: args.acceptedAs,
      renewed,
      resumeExpiresAt: credential.resumeExpiresAt,
      ...(credential.graceExpiresAt ? { graceExpiresAt: credential.graceExpiresAt } : {})
    }
  }

  revoke(relayHostId: string, relayDeviceId: string): void {
    const prefix = `${credentialKey(relayHostId, relayDeviceId)}\0`
    this.credentials.delete(credentialKey(relayHostId, relayDeviceId))
    for (const [token, invite] of this.invites) {
      if (invite.relayHostId === relayHostId && invite.relayDeviceId === relayDeviceId) {
        this.invites.delete(token)
      }
    }
    for (const key of this.installs.keys()) {
      if (key.startsWith(prefix)) {
        this.installs.delete(key)
      }
    }
    this.persist()
  }

  private prune(now: number): void {
    for (const [token, invite] of this.invites) {
      if (invite.expiresAt <= now || invite.attempts >= INVITE_MAX_ATTEMPTS) {
        this.invites.delete(token)
      }
    }
    for (const [key, credential] of this.credentials) {
      if (credential.resumeExpiresAt <= now && (credential.graceExpiresAt ?? 0) <= now) {
        this.credentials.delete(key)
      }
    }
    for (const [key, install] of this.installs) {
      if (install.savedAt + INSTALL_RETENTION_MS <= now) {
        this.installs.delete(key)
      }
    }
  }

  private load(): void {
    const state = readRelayCredentialState(this.dataPath)
    if (!state) {
      return
    }
    for (const invite of state.invites) {
      this.invites.set(invite.token, invite)
    }
    for (const credential of state.credentials) {
      this.credentials.set(
        credentialKey(credential.relayHostId, credential.relayDeviceId),
        credential
      )
    }
    for (const install of state.installs) {
      this.installs.set(install.key, install)
    }
    this.prune(Date.now())
  }

  private persist(): void {
    const state: PersistedRelayState = {
      version: 1,
      invites: [...this.invites.values()],
      credentials: [...this.credentials.values()],
      installs: [...this.installs.values()]
    }
    writeRelayCredentialState(this.dataPath, state)
  }
}
