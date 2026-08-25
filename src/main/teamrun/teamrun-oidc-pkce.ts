import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'

export type TeamRunAuthorizationCode = {
  code: string
  codeVerifier: string
  redirectUri: string
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function closeServer(server: Server): void {
  server.closeAllConnections?.()
  server.close()
}

function callbackPage(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
  })
  response.end(
    `<!doctype html><meta charset="utf-8"><title>TeamRun</title><style>body{font-family:system-ui;padding:3rem;color:#222}</style><h1>${message}</h1><p>You can close this window.</p>`
  )
}

export function beginTeamRunPkceFlow(args: {
  authorizationEndpoint: string
  clientId: string
  scope: string
}): Promise<TeamRunAuthorizationCode> {
  const codeVerifier = base64Url(randomBytes(32))
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest())
  const state = base64Url(randomBytes(32))
  const nonce = base64Url(randomBytes(32))
  return new Promise((resolve, reject) => {
    let settled = false
    let redirectUri = ''
    const finish = (result: TeamRunAuthorizationCode | Error) => {
      if (settled) {
        return
      }
      settled = true
      closeServer(server)
      if (result instanceof Error) {
        reject(result)
      } else {
        resolve(result)
      }
    }
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/auth/callback') {
        response.writeHead(404).end()
        return
      }
      if (url.searchParams.get('state') !== state) {
        callbackPage(response, 400, 'Invalid TeamRun sign-in response')
        return
      }
      const code = url.searchParams.get('code')
      if (!code || url.searchParams.has('error')) {
        callbackPage(response, 400, 'TeamRun sign-in was cancelled')
        finish(new Error('teamrun_auth_denied'))
        return
      }
      callbackPage(response, 200, 'TeamRun sign-in complete')
      finish({ code, codeVerifier, redirectUri })
    })
    const timeout = setTimeout(() => finish(new Error('teamrun_auth_timeout')), AUTH_TIMEOUT_MS)
    server.once('close', () => clearTimeout(timeout))
    server.once('error', (error) => finish(error))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(new Error('teamrun_auth_loopback_unavailable'))
        return
      }
      redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
      const url = new URL(args.authorizationEndpoint)
      url.searchParams.set('client_id', args.clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', args.scope)
      url.searchParams.set('state', state)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      void shell
        .openExternal(url.toString())
        .catch((error) =>
          finish(error instanceof Error ? error : new Error('teamrun_auth_browser_failed'))
        )
    })
  })
}
