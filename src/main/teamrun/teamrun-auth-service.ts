import { app } from 'electron'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { TeamRunAuthStatus, TeamRunSignInArgs } from '../../shared/teamrun-cloud'
import { beginTeamRunPkceFlow } from './teamrun-oidc-pkce'
import {
  clearTeamRunSession,
  readTeamRunSession,
  saveTeamRunSession,
  type TeamRunSession
} from './teamrun-session-store'

const authConfigSchema = z.object({
  issuer: z.url().nullable(),
  audience: z.string().nullable(),
  clientId: z.string().nullable(),
  devAuth: z.boolean(),
  sharedKeyAuth: z.boolean().optional().default(false)
})

const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url()
})

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().default(3600)
})

type ServiceAuthConfig = z.infer<typeof authConfigSchema>
type OidcDiscovery = z.infer<typeof discoverySchema>

export function normalizeTeamRunApiUrl(value: string): string {
  const url = new URL(value.trim())
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('teamrun_https_required')
  }
  return url.toString().replace(/\/$/, '')
}

function configuredApiUrl(): string | null {
  const value = process.env.TEAMRUN_API_URL?.trim()
  if (value) {
    return normalizeTeamRunApiUrl(value)
  }
  const session = readTeamRunSession()
  if (session?.mode === 'shared-key') return session.apiUrl
  return app.isPackaged ? null : 'http://127.0.0.1:4310'
}

function tokenEmail(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()
    ) as {
      email?: unknown
    }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

function tokenSubject(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()
    ) as {
      sub?: unknown
    }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    throw new Error(`teamrun_auth_http_${response.status}`)
  }
  return response.json()
}

export class TeamRunAuthService {
  #configCache: { apiUrl: string; value: ServiceAuthConfig; expiresAt: number } | null = null
  #refreshPromise: Promise<Extract<TeamRunSession, { mode: 'oidc' }>> | null = null

  get apiUrl(): string | null {
    return configuredApiUrl()
  }

  cacheScope(): string | null {
    const session = readTeamRunSession()
    const apiUrl = this.apiUrl
    if (!session || !apiUrl) return null
    const identity =
      session.mode === 'dev'
        ? `dev:${session.email}`
        : session.mode === 'shared-key'
          ? `shared-key:${session.email ?? 'team'}`
          : `oidc:${tokenSubject(session.accessToken) ?? session.email ?? 'unknown'}`
    return createHash('sha256').update(`${apiUrl}:${identity}`).digest('hex')
  }

  async status(): Promise<TeamRunAuthStatus> {
    const apiUrl = this.apiUrl
    if (!apiUrl) {
      return { state: 'unconfigured', apiUrl: '', devAuth: false, sharedKeyAuth: false }
    }
    try {
      const config = await this.#authConfig()
      const session = readTeamRunSession()
      return session
        ? {
            state: 'signed-in',
            apiUrl,
            devAuth: config.devAuth,
            sharedKeyAuth: config.sharedKeyAuth,
            email: session.email
          }
        : {
            state: 'signed-out',
            apiUrl,
            devAuth: config.devAuth,
            sharedKeyAuth: config.sharedKeyAuth
          }
    } catch (error) {
      return {
        state: 'error',
        apiUrl,
        devAuth: false,
        sharedKeyAuth: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async signIn(args: TeamRunSignInArgs = {}): Promise<TeamRunAuthStatus> {
    const apiUrl = args.apiUrl ? normalizeTeamRunApiUrl(args.apiUrl) : this.apiUrl
    if (!apiUrl) {
      return { state: 'unconfigured', apiUrl: '', devAuth: false, sharedKeyAuth: false }
    }
    const config = await this.#authConfig(apiUrl)
    if (config.sharedKeyAuth) {
      const accessKey = args.sharedKey?.trim()
      if (!accessKey || accessKey.length < 24) {
        throw new Error('teamrun_shared_key_required')
      }
      saveTeamRunSession({ mode: 'shared-key', apiUrl, accessKey, email: null })
      try {
        await fetchJson(`${apiUrl}/v1/organizations`, {
          headers: { authorization: `Bearer ${accessKey}` }
        })
      } catch (error) {
        clearTeamRunSession()
        throw error
      }
      return this.status()
    }
    if (config.devAuth) {
      const email = args.devEmail?.trim().toLowerCase()
      if (!email) {
        throw new Error('teamrun_dev_email_required')
      }
      saveTeamRunSession({ mode: 'dev', email })
      return this.status()
    }
    if (!config.issuer || !config.clientId) {
      throw new Error('teamrun_oidc_not_configured')
    }
    const discovery = await this.#discovery(config.issuer)
    const authorization = await beginTeamRunPkceFlow({
      authorizationEndpoint: discovery.authorization_endpoint,
      clientId: config.clientId,
      scope: 'openid profile email offline_access'
    })
    const token = tokenSchema.parse(
      await fetchJson(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          code: authorization.code,
          code_verifier: authorization.codeVerifier,
          redirect_uri: authorization.redirectUri
        })
      })
    )
    saveTeamRunSession({
      mode: 'oidc',
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: Date.now() + token.expires_in * 1000,
      email: tokenEmail(token.access_token),
      tokenEndpoint: discovery.token_endpoint,
      clientId: config.clientId
    })
    return this.status()
  }

  signOut(): TeamRunAuthStatus {
    clearTeamRunSession()
    const apiUrl = this.apiUrl ?? ''
    return {
      state: this.apiUrl ? 'signed-out' : 'unconfigured',
      apiUrl,
      devAuth: false,
      sharedKeyAuth: false
    }
  }

  async authorizationHeader(): Promise<string> {
    const session = readTeamRunSession()
    if (!session) {
      throw new Error('teamrun_authentication_required')
    }
    if (session.mode === 'dev') {
      return `Dev ${session.email}`
    }
    if (session.mode === 'shared-key') {
      return `Bearer ${session.accessKey}`
    }
    if (session.expiresAt > Date.now() + 60_000) {
      return `Bearer ${session.accessToken}`
    }
    const refreshed = await this.#refresh(session)
    return `Bearer ${refreshed.accessToken}`
  }

  async #authConfig(apiUrl = this.apiUrl): Promise<ServiceAuthConfig> {
    if (
      apiUrl &&
      this.#configCache?.apiUrl === apiUrl &&
      this.#configCache.expiresAt > Date.now()
    ) {
      return this.#configCache.value
    }
    if (!apiUrl) {
      throw new Error('teamrun_api_unconfigured')
    }
    const value = authConfigSchema.parse(await fetchJson(`${apiUrl}/v1/auth/config`))
    this.#configCache = { apiUrl, value, expiresAt: Date.now() + 5 * 60 * 1000 }
    return value
  }

  async #discovery(issuer: string): Promise<OidcDiscovery> {
    const url = new URL('.well-known/openid-configuration', `${issuer.replace(/\/$/, '')}/`)
    const discovery = discoverySchema.parse(await fetchJson(url.toString()))
    if (discovery.issuer !== issuer) {
      throw new Error('teamrun_oidc_issuer_mismatch')
    }
    return discovery
  }

  async #refresh(
    session: Extract<TeamRunSession, { mode: 'oidc' }>
  ): Promise<Extract<TeamRunSession, { mode: 'oidc' }>> {
    if (!session.refreshToken) {
      clearTeamRunSession()
      throw new Error('teamrun_session_expired')
    }
    this.#refreshPromise ??= this.#refreshToken(session).finally(() => {
      this.#refreshPromise = null
    })
    return this.#refreshPromise
  }

  async #refreshToken(
    session: Extract<TeamRunSession, { mode: 'oidc' }>
  ): Promise<Extract<TeamRunSession, { mode: 'oidc' }>> {
    const token = tokenSchema.parse(
      await fetchJson(session.tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: session.clientId,
          refresh_token: session.refreshToken as string
        })
      })
    )
    const refreshed: Extract<TeamRunSession, { mode: 'oidc' }> = {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      email: tokenEmail(token.access_token) ?? session.email
    }
    saveTeamRunSession(refreshed)
    return refreshed
  }
}
