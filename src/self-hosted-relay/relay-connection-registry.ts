import { randomBytes } from 'node:crypto'
import WebSocket, { type RawData } from 'ws'
import { MOBILE_RELAY_CLOSE_CODE } from '../shared/mobile-relay-close-codes'
import type { AuthorizedRelayCredential, RelayCredentialStore } from './relay-credential-store'

export type SelfHostedRelayControl = {
  generation: number
  send(message: object): void
}

export type RelayConnectionBasis = {
  relayHostId: string
  relayDeviceId: string
  credentialKind: 'invite' | 'resume'
  acceptedAs?: 'current' | 'grace'
}

type BufferedFrame = { data: Buffer; binary: boolean }

type PendingRelayConnection = RelayConnectionBasis & {
  connId: string
  connTicket: string
  phone: WebSocket
  host: WebSocket | null
  buffer: BufferedFrame[]
  bufferedBytes: number
  attachTimer: ReturnType<typeof setTimeout>
  closed: boolean
}

const ATTACH_DEADLINE_MS = 10_000
const MAX_BUFFERED_BYTES = 1024 * 1024
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/

function token(): string {
  return randomBytes(32).toString('base64url')
}

function rawBuffer(raw: RawData): Buffer {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw)
  }
  return Buffer.from(raw as Buffer | ArrayBuffer)
}

export class RelayConnectionRegistry {
  private readonly credentialStore: RelayCredentialStore
  private readonly getControl: (relayHostId: string) => SelfHostedRelayControl | null
  private readonly maxConnections: number
  private readonly connections = new Map<string, PendingRelayConnection>()

  constructor(options: {
    credentialStore: RelayCredentialStore
    getControl: (relayHostId: string) => SelfHostedRelayControl | null
    maxConnections: number
  }) {
    this.credentialStore = options.credentialStore
    this.getControl = options.getControl
    this.maxConnections = options.maxConnections
  }

  acceptPhone(relayHostId: string, credential: string, phone: WebSocket): void {
    if (this.connections.size >= this.maxConnections) {
      phone.close(MOBILE_RELAY_CLOSE_CODE.LIMIT_EXCEEDED, 'connection limit reached')
      return
    }
    const preview = CREDENTIAL_PATTERN.test(credential)
      ? this.credentialStore.authorize(relayHostId, credential, Date.now(), false)
      : null
    if (!preview) {
      phone.close(MOBILE_RELAY_CLOSE_CODE.BAD_OUTER_CREDENTIAL, 'invalid relay credential')
      return
    }
    const control = this.getControl(relayHostId)
    if (!control) {
      phone.close(MOBILE_RELAY_CLOSE_CODE.HOST_OFFLINE, 'host offline')
      return
    }
    const authorization =
      preview.kind === 'invite' ? this.credentialStore.authorize(relayHostId, credential) : preview
    if (!authorization) {
      phone.close(MOBILE_RELAY_CLOSE_CODE.BAD_OUTER_CREDENTIAL, 'expired relay credential')
      return
    }
    const connId = token()
    const connection: PendingRelayConnection = {
      connId,
      connTicket: token(),
      relayHostId,
      relayDeviceId: authorization.relayDeviceId,
      credentialKind: authorization.kind,
      ...(authorization.kind === 'resume' ? { acceptedAs: authorization.acceptedAs } : {}),
      phone,
      host: null,
      buffer: [],
      bufferedBytes: 0,
      attachTimer: setTimeout(() => this.expireAttach(connId), ATTACH_DEADLINE_MS),
      closed: false
    }
    this.connections.set(connId, connection)
    phone.on('message', (raw, binary) => this.handlePhoneFrame(connection, raw, binary))
    phone.once('close', () => this.closeConnection(connection, 'phone'))
    phone.once('error', () => this.closeConnection(connection, 'phone'))
    phone.send(JSON.stringify(this.phoneHello(authorization)))
    control.send({
      type: 'conn-open',
      connId,
      connTicket: connection.connTicket,
      kind: authorization.kind,
      relayDeviceId: authorization.relayDeviceId,
      attachDeadlineMs: ATTACH_DEADLINE_MS
    })
  }

  acceptHostData(connId: string, host: WebSocket): void {
    const connection = this.connections.get(connId)
    if (!connection || connection.closed || connection.host) {
      host.close(MOBILE_RELAY_CLOSE_CODE.PEER_DROPPED, 'connection unavailable')
      return
    }
    const authTimer = setTimeout(
      () => host.close(MOBILE_RELAY_CLOSE_CODE.BAD_OUTER_CREDENTIAL, 'host data auth timeout'),
      ATTACH_DEADLINE_MS
    )
    host.once('message', (raw, binary) => {
      clearTimeout(authTimer)
      if (binary || !this.acceptHostDataAuth(connection, raw.toString())) {
        host.close(MOBILE_RELAY_CLOSE_CODE.BAD_OUTER_CREDENTIAL, 'invalid host data auth')
        return
      }
      connection.host = host
      clearTimeout(connection.attachTimer)
      host.on('message', (payload, isBinary) => {
        if (!connection.closed && connection.phone.readyState === WebSocket.OPEN) {
          connection.phone.send(payload, { binary: isBinary })
        }
      })
      host.once('close', () => this.closeConnection(connection, 'host'))
      host.once('error', () => this.closeConnection(connection, 'host'))
      for (const frame of connection.buffer) {
        if (host.readyState === WebSocket.OPEN) {
          host.send(frame.data, { binary: frame.binary })
        }
      }
      connection.buffer = []
      connection.bufferedBytes = 0
    })
  }

  getBasis(relayHostId: string, connId: string): RelayConnectionBasis | null {
    const connection = this.connections.get(connId)
    if (!connection || connection.relayHostId !== relayHostId || connection.closed) {
      return null
    }
    return {
      relayHostId,
      relayDeviceId: connection.relayDeviceId,
      credentialKind: connection.credentialKind,
      acceptedAs: connection.acceptedAs
    }
  }

  closeHost(relayHostId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.relayHostId === relayHostId) {
        this.closeConnection(connection, 'host')
      }
    }
  }

  closeAll(): void {
    for (const connection of this.connections.values()) {
      this.closeConnection(connection, 'server')
    }
  }

  private phoneHello(authorization: AuthorizedRelayCredential): object {
    const leaseExpiresAt = Date.now() + ATTACH_DEADLINE_MS
    return authorization.kind === 'invite'
      ? { type: 'relay-hello', ok: true, credentialKind: 'invite', leaseExpiresAt }
      : {
          type: 'relay-hello',
          ok: true,
          credentialKind: 'resume',
          leaseExpiresAt,
          acceptedCredentialVersion: authorization.acceptedCredentialVersion,
          acceptedAs: authorization.acceptedAs,
          resumeExpiresAt: authorization.resumeExpiresAt,
          ...(authorization.graceExpiresAt ? { graceExpiresAt: authorization.graceExpiresAt } : {})
        }
  }

  private acceptHostDataAuth(connection: PendingRelayConnection, raw: string): boolean {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>
      const control = this.getControl(connection.relayHostId)
      return (
        message.type === 'host-data-auth' &&
        message.v === 1 &&
        message.connTicket === connection.connTicket &&
        message.generation === control?.generation
      )
    } catch {
      return false
    }
  }

  private handlePhoneFrame(
    connection: PendingRelayConnection,
    raw: RawData,
    binary: boolean
  ): void {
    if (connection.closed) {
      return
    }
    if (connection.host?.readyState === WebSocket.OPEN) {
      connection.host.send(raw, { binary })
      return
    }
    const data = rawBuffer(raw)
    connection.bufferedBytes += data.byteLength
    if (connection.bufferedBytes > MAX_BUFFERED_BYTES) {
      this.closeConnection(connection, 'limit')
      return
    }
    connection.buffer.push({ data, binary })
  }

  private expireAttach(connId: string): void {
    const connection = this.connections.get(connId)
    if (connection) {
      this.closeConnection(connection, 'host')
    }
  }

  private closeConnection(
    connection: PendingRelayConnection,
    source: 'phone' | 'host' | 'server' | 'limit'
  ): void {
    if (connection.closed) {
      return
    }
    connection.closed = true
    clearTimeout(connection.attachTimer)
    this.connections.delete(connection.connId)
    const code =
      source === 'limit'
        ? MOBILE_RELAY_CLOSE_CODE.LIMIT_EXCEEDED
        : source === 'host'
          ? MOBILE_RELAY_CLOSE_CODE.HOST_OFFLINE
          : MOBILE_RELAY_CLOSE_CODE.PEER_DROPPED
    if (source !== 'phone' && connection.phone.readyState === WebSocket.OPEN) {
      connection.phone.close(code)
    }
    if (source !== 'host' && connection.host?.readyState === WebSocket.OPEN) {
      connection.host.close(MOBILE_RELAY_CLOSE_CODE.PEER_DROPPED)
    }
  }
}
