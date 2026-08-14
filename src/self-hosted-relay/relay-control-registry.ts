import { randomBytes } from 'node:crypto'
import WebSocket, { type RawData } from 'ws'
import type { DeviceCredentialInstallAuthorization } from '../main/runtime/relay/relay-control-requests'
import type { RelayCredentialStore } from './relay-credential-store'
import type { RelayConnectionRegistry, SelfHostedRelayControl } from './relay-connection-registry'
import { relayAccessTokenMatches } from './relay-server-config'
import { relayHostIdForPublicKey } from './relay-host-identity'

type ActiveControl = SelfHostedRelayControl & {
  relayHostId: string
  socket: WebSocket
  pingTimer: ReturnType<typeof setInterval>
}

const HOST_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CONTROL_LEASE_MS = 60 * 60_000
const MAX_REQUEST_ID_LENGTH = 128
const MAX_DEVICE_ID_LENGTH = 128

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function parseJson(raw: RawData): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw.toString()) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export class RelayControlRegistry {
  private readonly accessToken: string
  private readonly credentials: RelayCredentialStore
  private readonly connections: RelayConnectionRegistry
  private readonly controls = new Map<string, ActiveControl>()
  private readonly generations = new Map<string, number>()

  constructor(options: {
    accessToken: string
    credentials: RelayCredentialStore
    connections: RelayConnectionRegistry
  }) {
    this.accessToken = options.accessToken
    this.credentials = options.credentials
    this.connections = options.connections
  }

  get(relayHostId: string): SelfHostedRelayControl | null {
    return this.controls.get(relayHostId) ?? null
  }

  accept(socket: WebSocket): void {
    const helloTimer = setTimeout(() => socket.close(4401, 'host hello timeout'), 10_000)
    socket.once('message', (raw, binary) => {
      clearTimeout(helloTimer)
      const hello = binary ? null : parseJson(raw)
      const relayHostId = this.validateHostHello(hello)
      if (!relayHostId) {
        socket.close(4401, 'invalid host hello')
        return
      }
      this.activate(relayHostId, socket)
    })
  }

  closeAll(): void {
    for (const control of this.controls.values()) {
      clearInterval(control.pingTimer)
      control.socket.close(1001, 'server shutdown')
    }
    this.controls.clear()
  }

  private validateHostHello(message: Record<string, unknown> | null): string | null {
    if (
      message?.type !== 'host-hello' ||
      message.v !== 1 ||
      typeof message.relayHostId !== 'string' ||
      !HOST_ID_PATTERN.test(message.relayHostId) ||
      typeof message.hostPublicKeyB64 !== 'string' ||
      relayHostIdForPublicKey(message.hostPublicKeyB64) !== message.relayHostId ||
      message.assignmentEpoch !== 1
    ) {
      return null
    }
    return message.relayHostId
  }

  private activate(relayHostId: string, socket: WebSocket): void {
    const previous = this.controls.get(relayHostId)
    const generation = (this.generations.get(relayHostId) ?? 0) + 1
    this.generations.set(relayHostId, generation)
    const control: ActiveControl = {
      relayHostId,
      socket,
      generation,
      send: (message) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message))
        }
      },
      pingTimer: setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', t: Date.now() }))
        }
      }, 15_000)
    }
    control.pingTimer.unref()
    this.controls.set(relayHostId, control)
    socket.on('message', (raw, binary) => {
      if (!binary) {
        this.handleMessage(control, parseJson(raw))
      }
    })
    const close = (): void => {
      clearInterval(control.pingTimer)
      if (this.controls.get(relayHostId) === control) {
        this.controls.delete(relayHostId)
        this.connections.closeHost(relayHostId)
      }
    }
    socket.once('close', close)
    socket.once('error', close)
    control.send({
      type: 'host-hello-ack',
      v: 1,
      generation,
      controlResumeSecret: randomBytes(32).toString('base64url'),
      leaseExpiresAt: Date.now() + CONTROL_LEASE_MS,
      activeConnIds: [],
      pendingConns: []
    })
    if (previous && previous !== control) {
      clearInterval(previous.pingTimer)
      previous.socket.close(1000, 'control replaced')
    }
  }

  private handleMessage(control: ActiveControl, message: Record<string, unknown> | null): void {
    if (!message || this.controls.get(control.relayHostId) !== control) {
      return
    }
    if (message.type === 'pong') {
      return
    }
    if (message.type === 'auth-refresh') {
      if (
        typeof message.relayJwt !== 'string' ||
        !relayAccessTokenMatches(this.accessToken, message.relayJwt)
      ) {
        control.socket.close(4401, 'invalid refreshed authorization')
      }
      return
    }
    const reqId = boundedText(message.reqId, MAX_REQUEST_ID_LENGTH) ? message.reqId : undefined
    try {
      if (message.type === 'invite-create') {
        this.createInvite(control, message, reqId)
      } else if (message.type === 'device-revoke') {
        this.revokeDevice(control, message, reqId)
      } else if (message.type === 'device-credential-install') {
        this.installCredential(control, message, reqId)
      } else if (message.type === 'device-credential-install-status') {
        this.installStatus(control, message, reqId)
      } else if (message.type === 'device-resume-confirm') {
        this.confirmResume(control, message, reqId)
      }
    } catch (error) {
      control.send({
        type: 'control-error',
        ...(reqId ? { reqId } : {}),
        code: error instanceof Error ? error.message : 'relay_control_request_failed'
      })
    }
  }

  private createInvite(
    control: ActiveControl,
    message: Record<string, unknown>,
    reqId: string | undefined
  ): void {
    const relayDeviceId = this.requestIdentity(message, reqId)
    const invite = this.credentials.createInvite(control.relayHostId, relayDeviceId)
    control.send({
      type: 'invite-created',
      reqId,
      inviteToken: invite.token,
      expiresAt: invite.expiresAt,
      maxAttempts: 6
    })
  }

  private revokeDevice(
    control: ActiveControl,
    message: Record<string, unknown>,
    reqId: string | undefined
  ): void {
    const relayDeviceId = this.requestIdentity(message, reqId)
    this.credentials.revoke(control.relayHostId, relayDeviceId)
    control.send({ type: 'device-revoked', reqId })
  }

  private installCredential(
    control: ActiveControl,
    message: Record<string, unknown>,
    reqId: string | undefined
  ): void {
    const relayDeviceId = this.requestIdentity(message, reqId)
    if (
      typeof message.newResumeTokenHash !== 'string' ||
      !TOKEN_HASH_PATTERN.test(message.newResumeTokenHash) ||
      (message.expectedCurrentHash !== undefined &&
        (typeof message.expectedCurrentHash !== 'string' ||
          !TOKEN_HASH_PATTERN.test(message.expectedCurrentHash)))
    ) {
      throw new Error('invalid_resume_token_hash')
    }
    const authorization = this.installAuthorization(control, relayDeviceId, message.authorization)
    const result = this.credentials.install({
      relayHostId: control.relayHostId,
      relayDeviceId,
      reqId: reqId!,
      newResumeTokenHash: message.newResumeTokenHash,
      ...(typeof message.expectedCurrentHash === 'string'
        ? { expectedCurrentHash: message.expectedCurrentHash }
        : {}),
      authorization
    })
    control.send({ type: 'device-credential-installed', ...result })
  }

  private installStatus(
    control: ActiveControl,
    message: Record<string, unknown>,
    reqId: string | undefined
  ): void {
    const relayDeviceId = this.requestIdentity(message, reqId)
    const result = this.credentials.installStatus(control.relayHostId, relayDeviceId, reqId!)
    control.send(
      result
        ? {
            type: 'device-credential-install-status-result',
            v: 1,
            reqId,
            state: 'committed',
            result
          }
        : { type: 'device-credential-install-status-result', v: 1, reqId, state: 'not-found' }
    )
  }

  private confirmResume(
    control: ActiveControl,
    message: Record<string, unknown>,
    reqId: string | undefined
  ): void {
    if (
      !reqId ||
      typeof message.basisConnId !== 'string' ||
      !TOKEN_HASH_PATTERN.test(message.basisConnId)
    ) {
      throw new Error('invalid_resume_confirmation')
    }
    const basis = this.connections.getBasis(control.relayHostId, message.basisConnId)
    if (!basis || basis.credentialKind !== 'resume' || !basis.acceptedAs) {
      throw new Error('relay_resume_basis_not_found')
    }
    const result = this.credentials.confirmResume({
      relayHostId: control.relayHostId,
      relayDeviceId: basis.relayDeviceId,
      reqId,
      acceptedAs: basis.acceptedAs
    })
    control.send({ type: 'device-resume-confirmed', ...result })
  }

  private requestIdentity(message: Record<string, unknown>, reqId: string | undefined): string {
    if (!reqId || !boundedText(message.relayDeviceId, MAX_DEVICE_ID_LENGTH)) {
      throw new Error('invalid_relay_control_request')
    }
    return message.relayDeviceId
  }

  private installAuthorization(
    control: ActiveControl,
    relayDeviceId: string,
    value: unknown
  ): DeviceCredentialInstallAuthorization {
    if (!value || typeof value !== 'object') {
      throw new Error('invalid_relay_install_authorization')
    }
    const authorization = value as Record<string, unknown>
    if (
      authorization.mode === 'authenticated-direct' &&
      boundedText(authorization.directAuthId, MAX_DEVICE_ID_LENGTH)
    ) {
      return { mode: 'authenticated-direct', directAuthId: authorization.directAuthId }
    }
    if (
      authorization.mode === 'relay-basis' &&
      typeof authorization.basisConnId === 'string' &&
      TOKEN_HASH_PATTERN.test(authorization.basisConnId)
    ) {
      const basis = this.connections.getBasis(control.relayHostId, authorization.basisConnId)
      if (basis?.credentialKind !== 'invite' || basis.relayDeviceId !== relayDeviceId) {
        throw new Error('relay_install_basis_not_found')
      }
      return { mode: 'relay-basis', basisConnId: authorization.basisConnId }
    }
    throw new Error('invalid_relay_install_authorization')
  }
}
