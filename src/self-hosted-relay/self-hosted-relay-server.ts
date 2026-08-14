import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { RelayConnectionRegistry } from './relay-connection-registry'
import { RelayControlRegistry } from './relay-control-registry'
import { RelayCredentialStore } from './relay-credential-store'
import { relayHostIdForPublicKey } from './relay-host-identity'
import { relayAccessTokenMatches, type SelfHostedRelayServerConfig } from './relay-server-config'

const MAX_REQUEST_BYTES = 16 * 1024
const HOST_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/

function bearerToken(request: IncomingMessage): string | undefined {
  const value = request.headers.authorization
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : undefined
}

function sendJson(response: ServerResponse, statusCode: number, value: object): void {
  const body = JSON.stringify(value)
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  })
  response.end(body)
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('request_too_large')
    }
    chunks.push(bytes)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_request_json')
  }
  return value as Record<string, unknown>
}

function websocketPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://relay.internal').pathname
  } catch {
    return '/invalid'
  }
}

export class SelfHostedRelayServer {
  private readonly config: SelfHostedRelayServerConfig
  private readonly credentials: RelayCredentialStore
  private readonly connections: RelayConnectionRegistry
  private readonly controls: RelayControlRegistry
  private readonly webSockets = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 1024 * 1024
  })
  private readonly server = createServer((request, response) => {
    void this.handleHttp(request, response)
  })

  constructor(config: SelfHostedRelayServerConfig) {
    this.config = config
    this.credentials = new RelayCredentialStore(config.dataPath)
    let controls: RelayControlRegistry | null = null
    this.connections = new RelayConnectionRegistry({
      credentialStore: this.credentials,
      getControl: (relayHostId) => controls?.get(relayHostId) ?? null,
      maxConnections: config.maxConnections
    })
    controls = new RelayControlRegistry({
      accessToken: config.accessToken,
      credentials: this.credentials,
      connections: this.connections
    })
    this.controls = controls
    this.server.on('upgrade', (request, socket, head) => {
      const path = websocketPath(request)
      if (
        path === '/v1/host/control' &&
        !relayAccessTokenMatches(config.accessToken, bearerToken(request))
      ) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      if (
        path !== '/v1/host/control' &&
        !path.startsWith('/v1/host/data/') &&
        !path.startsWith('/v1/connect/')
      ) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      this.webSockets.handleUpgrade(request, socket, head, (webSocket) => {
        this.routeWebSocket(path, webSocket)
      })
    })
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject)
        resolve()
      })
    })
  }

  get localPort(): number | null {
    const address = this.server.address()
    return address && typeof address !== 'string' ? (address as AddressInfo).port : null
  }

  stop(): Promise<void> {
    this.controls.closeAll()
    this.connections.closeAll()
    for (const socket of this.webSockets.clients) {
      socket.close(1001, 'server shutdown')
    }
    return new Promise((resolve) => this.server.close(() => resolve()))
  }

  private async handleHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const path = websocketPath(request)
      if (request.method === 'GET' && path === '/healthz') {
        sendJson(response, 200, { ok: true, service: 'orca-self-hosted-relay' })
        return
      }
      if (request.method !== 'POST') {
        sendJson(response, 404, { error: 'not_found' })
        return
      }
      const body = await readJson(request)
      if (path === '/v1/auth/relay-token') {
        this.exchangeRelayToken(request, response, body)
      } else if (path === '/v1/assign') {
        this.assignRelay(request, response, body)
      } else if (path === '/v1/resolve') {
        this.resolveRelay(response, body)
      } else {
        sendJson(response, 404, { error: 'not_found' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid_request'
      sendJson(response, message === 'request_too_large' ? 413 : 400, {
        error: message
      })
    }
  }

  private exchangeRelayToken(
    request: IncomingMessage,
    response: ServerResponse,
    body: Record<string, unknown>
  ): void {
    if (
      !relayAccessTokenMatches(this.config.accessToken, bearerToken(request)) ||
      typeof body.relayHostId !== 'string' ||
      typeof body.hostPublicKeyB64 !== 'string' ||
      relayHostIdForPublicKey(body.hostPublicKeyB64) !== body.relayHostId
    ) {
      sendJson(response, 401, { error: 'unauthorized' })
      return
    }
    sendJson(response, 200, {
      relayToken: this.config.accessToken,
      expiresAt: Date.now() + 60 * 60_000
    })
  }

  private assignRelay(
    request: IncomingMessage,
    response: ServerResponse,
    body: Record<string, unknown>
  ): void {
    if (
      !relayAccessTokenMatches(this.config.accessToken, bearerToken(request)) ||
      body.v !== 1 ||
      typeof body.relayHostId !== 'string' ||
      !HOST_ID_PATTERN.test(body.relayHostId)
    ) {
      sendJson(response, 401, { error: 'unauthorized' })
      return
    }
    sendJson(response, 200, {
      v: 1,
      cellUrl: this.config.publicUrl,
      assignmentEpoch: 1,
      lease: randomBytes(32).toString('base64url')
    })
  }

  private resolveRelay(response: ServerResponse, body: Record<string, unknown>): void {
    if (
      body.v !== 1 ||
      typeof body.relayHostId !== 'string' ||
      typeof body.resumeToken !== 'string'
    ) {
      sendJson(response, 400, { error: 'invalid_request' })
      return
    }
    const authorized = this.credentials.authorize(body.relayHostId, body.resumeToken)
    if (authorized?.kind !== 'resume') {
      sendJson(response, 401, { error: 'invalid_credential' })
      return
    }
    sendJson(response, 200, {
      v: 1,
      cellUrl: this.config.publicUrl,
      assignmentEpoch: 1,
      leaseExpiresAt: Date.now() + 60_000
    })
  }

  private routeWebSocket(path: string, socket: WebSocket): void {
    if (path === '/v1/host/control') {
      this.controls.accept(socket)
      return
    }
    const hostDataPrefix = '/v1/host/data/'
    if (path.startsWith(hostDataPrefix)) {
      const connId = this.decodePathSegment(path.slice(hostDataPrefix.length))
      if (!connId) {
        socket.close(4401, 'invalid connection')
        return
      }
      this.connections.acceptHostData(connId, socket)
      return
    }
    const phonePrefix = '/v1/connect/'
    const relayHostId = this.decodePathSegment(path.slice(phonePrefix.length))
    if (!HOST_ID_PATTERN.test(relayHostId)) {
      socket.close(4401, 'invalid relay host')
      return
    }
    const authTimer = setTimeout(() => socket.close(4401, 'relay auth timeout'), 10_000)
    socket.once('message', (raw, binary) => {
      clearTimeout(authTimer)
      let message: Record<string, unknown> | null = null
      try {
        message = binary ? null : (JSON.parse(raw.toString()) as Record<string, unknown>)
      } catch {
        message = null
      }
      if (
        message?.type !== 'relay-auth' ||
        message.v !== 1 ||
        message.mode !== 'connect' ||
        typeof message.credential !== 'string'
      ) {
        socket.close(4401, 'invalid relay auth')
        return
      }
      this.connections.acceptPhone(relayHostId, message.credential, socket)
    })
  }

  private decodePathSegment(value: string): string | null {
    try {
      const decoded = decodeURIComponent(value)
      return decoded && !decoded.includes('/') ? decoded : null
    } catch {
      return null
    }
  }
}
