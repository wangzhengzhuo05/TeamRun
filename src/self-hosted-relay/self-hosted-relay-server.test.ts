import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import WebSocket, { type RawData } from 'ws'
import { SelfHostedRelayServer } from './self-hosted-relay-server'
import { relayHostIdForPublicKey } from './relay-host-identity'

function nextJson(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString()) as Record<string, unknown>))
  })
}

function nextFrame(socket: WebSocket): Promise<{ raw: RawData; binary: boolean }> {
  return new Promise((resolve) => {
    socket.once('message', (raw, binary) => resolve({ raw, binary }))
  })
}

function openSocket(url: string, headers?: Record<string, string>): Promise<WebSocket> {
  const socket = new WebSocket(url, { headers })
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

describe('self-hosted Relay server', () => {
  const servers: SelfHostedRelayServer[] = []
  const sockets: WebSocket[] = []
  const dataPaths: string[] = []

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.terminate()
    }
    await Promise.all(servers.splice(0).map((server) => server.stop()))
    for (const path of dataPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  it('authenticates a host, creates an invite, and splices phone data', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'orca-self-relay-'))
    dataPaths.push(dataDirectory)
    const accessToken = 'server-access-key-that-is-at-least-32-characters'
    const server = new SelfHostedRelayServer({
      publicUrl: 'https://relay.example.test',
      host: '127.0.0.1',
      port: 0,
      accessToken,
      dataPath: join(dataDirectory, 'state.json'),
      maxConnections: 8
    })
    servers.push(server)
    await server.start()
    const port = server.localPort
    expect(port).not.toBeNull()
    const httpOrigin = `http://127.0.0.1:${port}`
    const wsOrigin = `ws://127.0.0.1:${port}`

    const keypair = nacl.box.keyPair()
    const hostPublicKeyB64 = Buffer.from(keypair.publicKey).toString('base64')
    const relayHostId = relayHostIdForPublicKey(hostPublicKeyB64)!
    const exchange = await fetch(`${httpOrigin}/v1/auth/relay-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ relayHostId, hostPublicKeyB64 })
    })
    expect(exchange.status).toBe(200)
    expect(await exchange.json()).toMatchObject({ relayToken: accessToken })

    const control = await openSocket(`${wsOrigin}/v1/host/control`, {
      authorization: `Bearer ${accessToken}`
    })
    sockets.push(control)
    const helloAck = nextJson(control)
    control.send(
      JSON.stringify({
        type: 'host-hello',
        v: 1,
        relayHostId,
        assignmentEpoch: 1,
        hostPublicKeyB64,
        appVersion: 'test'
      })
    )
    await expect(helloAck).resolves.toMatchObject({
      type: 'host-hello-ack',
      v: 1,
      generation: 1
    })

    const inviteCreated = nextJson(control)
    control.send(
      JSON.stringify({ type: 'invite-create', reqId: 'invite-1', relayDeviceId: 'phone-1' })
    )
    const invite = await inviteCreated
    expect(invite).toMatchObject({ type: 'invite-created', reqId: 'invite-1' })

    const phone = await openSocket(`${wsOrigin}/v1/connect/${relayHostId}`)
    sockets.push(phone)
    const phoneHello = nextJson(phone)
    const connectionOpen = nextJson(control)
    phone.send(
      JSON.stringify({
        type: 'relay-auth',
        v: 1,
        mode: 'connect',
        credential: invite.inviteToken
      })
    )
    await expect(phoneHello).resolves.toMatchObject({
      type: 'relay-hello',
      ok: true,
      credentialKind: 'invite'
    })
    const connection = await connectionOpen
    if (typeof connection.connId !== 'string' || typeof connection.connTicket !== 'string') {
      throw new TypeError('Relay connection response is missing credentials')
    }

    const hostData = await openSocket(`${wsOrigin}/v1/host/data/${connection.connId}`)
    sockets.push(hostData)
    hostData.send(
      JSON.stringify({
        type: 'host-data-auth',
        v: 1,
        connTicket: connection.connTicket,
        generation: 1
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    const hostFrame = nextFrame(hostData)
    phone.send(new Uint8Array([1, 2, 3]))
    await expect(hostFrame).resolves.toMatchObject({ binary: true })
    expect(new Uint8Array((await hostFrame).raw as Buffer)).toEqual(new Uint8Array([1, 2, 3]))

    const phoneFrame = nextFrame(phone)
    hostData.send('encrypted-response')
    await expect(phoneFrame).resolves.toMatchObject({ binary: false })
    expect((await phoneFrame).raw.toString()).toBe('encrypted-response')

    const resumeToken = randomBytes(32).toString('base64url')
    const resumeTokenHash = createHash('sha256').update(resumeToken).digest('base64url')
    const credentialInstalled = nextJson(control)
    control.send(
      JSON.stringify({
        type: 'device-credential-install',
        v: 1,
        reqId: 'install-1',
        relayDeviceId: 'phone-1',
        newResumeTokenHash: resumeTokenHash,
        authorization: { mode: 'relay-basis', basisConnId: connection.connId }
      })
    )
    await expect(credentialInstalled).resolves.toMatchObject({
      type: 'device-credential-installed',
      reqId: 'install-1',
      authorizationMode: 'relay-basis',
      currentVersion: 1
    })

    const resolved = await fetch(`${httpOrigin}/v1/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ v: 1, relayHostId, resumeToken })
    })
    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toMatchObject({
      v: 1,
      cellUrl: 'https://relay.example.test',
      assignmentEpoch: 1
    })

    const resumedPhone = await openSocket(`${wsOrigin}/v1/connect/${relayHostId}`)
    sockets.push(resumedPhone)
    const resumedHello = nextJson(resumedPhone)
    const resumedConnectionOpen = nextJson(control)
    resumedPhone.send(
      JSON.stringify({ type: 'relay-auth', v: 1, mode: 'connect', credential: resumeToken })
    )
    await expect(resumedHello).resolves.toMatchObject({
      type: 'relay-hello',
      ok: true,
      credentialKind: 'resume',
      acceptedCredentialVersion: 1,
      acceptedAs: 'current'
    })
    const resumedConnection = await resumedConnectionOpen
    const resumeConfirmed = nextJson(control)
    control.send(
      JSON.stringify({
        type: 'device-resume-confirm',
        v: 1,
        reqId: 'confirm-1',
        basisConnId: resumedConnection.connId
      })
    )
    await expect(resumeConfirmed).resolves.toMatchObject({
      type: 'device-resume-confirmed',
      reqId: 'confirm-1',
      acceptedAs: 'current',
      renewed: true
    })
  })
})
