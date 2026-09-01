import { randomUUID } from 'node:crypto'
import nacl from 'tweetnacl'
import WebSocket from 'ws'
import {
  TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY,
  TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY
} from '@teamrun/contracts'
import { ApiProblem } from '../http/api-problem.js'
import type { TeamServerPairingOffer } from './team-server-pairing.js'

type RuntimeResponse<TResult> =
  | { id: string; ok: true; result: TResult; _meta?: { runtimeId?: string } }
  | { id: string; ok: false; error: { code?: string; message?: string } }

type HandshakeState = 'ready' | 'authenticated' | 'response'

export async function sendTeamServerRuntimeRequest<TResult>(
  pairing: TeamServerPairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number
): Promise<TResult> {
  const response = await exchange<TResult>(pairing, method, params, timeoutMs)
  if (!response.ok) {
    throw new ApiProblem(
      502,
      response.error.code ?? 'team_server_runtime_error',
      response.error.message ?? 'Team Server rejected the request'
    )
  }
  return response.result
}

function exchange<TResult>(
  pairing: TeamServerPairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number
): Promise<RuntimeResponse<TResult>> {
  const requestId = randomUUID()
  const keyPair = nacl.box.keyPair()
  const peerKey = Uint8Array.from(Buffer.from(pairing.publicKeyB64, 'base64'))
  const sharedKey = nacl.box.before(peerKey, keyPair.secretKey)
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(pairing.endpoint, { maxPayload: 8 * 1024 * 1024 + 64 })
    let state: HandshakeState = 'ready'
    let settled = false
    const timeout = setTimeout(
      () => finish(new ApiProblem(504, 'team_server_timeout', 'Team Server did not respond')),
      timeoutMs
    )

    const finish = (error?: Error, response?: RuntimeResponse<TResult>): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      socket.removeAllListeners()
      socket.on('error', () => undefined)
      socket.terminate()
      if (error) {
        reject(error)
      } else {
        resolve(response!)
      }
    }

    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: Buffer.from(keyPair.publicKey).toString('base64')
        })
      )
    })
    socket.on('error', () =>
      finish(new ApiProblem(503, 'team_server_unavailable', 'Team Server is unreachable'))
    )
    socket.on('close', () =>
      finish(new ApiProblem(503, 'team_server_unavailable', 'Team Server connection closed'))
    )
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        finish(new ApiProblem(502, 'team_server_protocol_invalid', 'Unexpected binary frame'))
        return
      }
      try {
        const text = data.toString()
        if (state === 'ready') {
          requireFrameType(text, 'e2ee_ready')
          socket.send(
            encrypt(
              JSON.stringify({
                type: 'e2ee_auth',
                deviceToken: pairing.deviceToken,
                clientCapabilities: [
                  'teamrun.team-server.v1',
                  TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY,
                  TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY
                ]
              }),
              sharedKey
            )
          )
          state = 'authenticated'
          return
        }
        const plaintext = decrypt(text, sharedKey)
        if (state === 'authenticated') {
          requireFrameType(plaintext, 'e2ee_authenticated')
          socket.send(
            encrypt(
              JSON.stringify({
                id: requestId,
                deviceToken: pairing.deviceToken,
                method,
                params
              }),
              sharedKey
            )
          )
          state = 'response'
          return
        }
        const parsed = JSON.parse(plaintext) as unknown
        if (isKeepalive(parsed)) {
          return
        }
        const response = parseRuntimeResponse<TResult>(parsed, requestId)
        finish(undefined, response)
      } catch {
        finish(
          new ApiProblem(502, 'team_server_protocol_invalid', 'Team Server response is invalid')
        )
      }
    })
  })
}

function encrypt(value: string, sharedKey: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(new TextEncoder().encode(value), nonce, sharedKey)
  return Buffer.from(Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)])).toString(
    'base64'
  )
}

function decrypt(value: string, sharedKey: Uint8Array): string {
  const bundle = Uint8Array.from(Buffer.from(value, 'base64'))
  const plaintext = nacl.box.open.after(
    bundle.slice(nacl.box.nonceLength),
    bundle.slice(0, nacl.box.nonceLength),
    sharedKey
  )
  if (!plaintext) {
    throw new Error('invalid_runtime_ciphertext')
  }
  return new TextDecoder().decode(plaintext)
}

function requireFrameType(value: string, expected: string): void {
  const parsed = JSON.parse(value) as { type?: unknown }
  if (parsed.type !== expected) {
    throw new Error('unexpected_runtime_frame')
  }
}

function isKeepalive(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_keepalive' in value &&
    (value as { _keepalive: unknown })._keepalive === true
  )
}

function parseRuntimeResponse<TResult>(
  value: unknown,
  requestId: string
): RuntimeResponse<TResult> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('invalid_runtime_response')
  }
  const candidate = value as {
    id?: unknown
    ok?: unknown
    result?: unknown
    error?: { code?: unknown; message?: unknown }
  }
  if (candidate.id !== requestId || typeof candidate.ok !== 'boolean') {
    throw new Error('invalid_runtime_response')
  }
  if (candidate.ok) {
    return { id: requestId, ok: true, result: candidate.result as TResult }
  }
  if (
    typeof candidate.error !== 'object' ||
    candidate.error === null ||
    (candidate.error.code !== undefined && typeof candidate.error.code !== 'string') ||
    (candidate.error.message !== undefined && typeof candidate.error.message !== 'string')
  ) {
    throw new Error('invalid_runtime_response')
  }
  return {
    id: requestId,
    ok: false,
    error: {
      ...(typeof candidate.error.code === 'string' ? { code: candidate.error.code } : {}),
      ...(typeof candidate.error.message === 'string' ? { message: candidate.error.message } : {})
    }
  }
}
