import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import nacl from 'tweetnacl'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import type { TeamServerPairingOffer } from './team-server-pairing.js'
import { sendTeamServerRuntimeRequest } from './team-server-runtime-client.js'

describe('Team Server runtime client', () => {
  let server: WebSocketServer | null = null

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = null
    }
  })

  it('authenticates over E2EE and ignores keepalives before the RPC response', async () => {
    const serverKeys = nacl.box.keyPair()
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    const pairing: TeamServerPairingOffer = {
      v: 2,
      endpoint: `ws://127.0.0.1:${address.port}`,
      deviceToken: 'team-server-token',
      publicKeyB64: Buffer.from(serverKeys.publicKey).toString('base64'),
      pairedDeviceId: 'team-server-device',
      scope: 'runtime'
    }
    const handled = new Promise<void>((resolve, reject) => {
      server!.once('connection', (socket) => {
        let sharedKey: Uint8Array | null = null
        let state: 'hello' | 'auth' | 'request' = 'hello'
        socket.on('message', (frame) => {
          try {
            if (state === 'hello') {
              const hello = JSON.parse(frame.toString()) as { publicKeyB64: string }
              sharedKey = nacl.box.before(
                Uint8Array.from(Buffer.from(hello.publicKeyB64, 'base64')),
                serverKeys.secretKey
              )
              socket.send(JSON.stringify({ type: 'e2ee_ready' }))
              state = 'auth'
              return
            }
            const request = JSON.parse(decrypt(frame.toString(), sharedKey!)) as {
              id?: string
              type?: string
              deviceToken?: string
              clientCapabilities?: string[]
              method?: string
            }
            if (state === 'auth') {
              expect(request).toMatchObject({
                type: 'e2ee_auth',
                deviceToken: pairing.deviceToken,
                clientCapabilities: ['teamrun.team-server.v1']
              })
              socket.send(encrypt(JSON.stringify({ type: 'e2ee_authenticated' }), sharedKey!))
              state = 'request'
              return
            }
            expect(request).toMatchObject({ method: 'teamrun.teamServer.status' })
            socket.send(encrypt(JSON.stringify({ _keepalive: true }), sharedKey!))
            socket.send(
              encrypt(
                JSON.stringify({ id: request.id, ok: true, result: { runtimeId: 'runtime-1' } }),
                sharedKey!
              )
            )
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
    })

    await expect(
      sendTeamServerRuntimeRequest<{ runtimeId: string }>(
        pairing,
        'teamrun.teamServer.status',
        undefined,
        2_000
      )
    ).resolves.toEqual({ runtimeId: 'runtime-1' })
    await handled
  })
})

function encrypt(value: string, sharedKey: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(new TextEncoder().encode(value), nonce, sharedKey)
  return Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)]).toString('base64')
}

function decrypt(value: string, sharedKey: Uint8Array): string {
  const bundle = Uint8Array.from(Buffer.from(value, 'base64'))
  const plaintext = nacl.box.open.after(
    bundle.slice(nacl.box.nonceLength),
    bundle.slice(0, nacl.box.nonceLength),
    sharedKey
  )
  if (!plaintext) {
    throw new Error('test_decrypt_failed')
  }
  return new TextDecoder().decode(plaintext)
}
