import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { TeamRunServiceConfig } from '../service-config.js'
import { ApiProblem } from '../http/api-problem.js'

type OidcClaims = {
  subject: string
  email: string
  displayName: string
}

type OidcDiscovery = { issuer: string; jwks_uri: string }

let cachedIssuer: string | null = null
let cachedKeySet: JWTVerifyGetKey | null = null

async function getKeySet(issuer: string): Promise<JWTVerifyGetKey> {
  if (cachedKeySet && cachedIssuer === issuer) {
    return cachedKeySet
  }
  const discoveryUrl = new URL('.well-known/openid-configuration', `${issuer.replace(/\/$/, '')}/`)
  const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new ApiProblem(503, 'oidc_discovery_failed', 'OIDC discovery is unavailable')
  }
  const discovery = (await response.json()) as OidcDiscovery
  if (discovery.issuer !== issuer || !discovery.jwks_uri) {
    throw new ApiProblem(503, 'oidc_discovery_invalid', 'OIDC discovery response is invalid')
  }
  cachedIssuer = issuer
  cachedKeySet = createRemoteJWKSet(new URL(discovery.jwks_uri), {
    timeoutDuration: 10_000,
    cooldownDuration: 30_000
  })
  return cachedKeySet
}

function requireStringClaim(value: unknown, claim: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiProblem(401, 'invalid_access_token', `Access token is missing ${claim}`)
  }
  return value.trim()
}

export async function verifyOidcToken(
  token: string,
  config: TeamRunServiceConfig
): Promise<OidcClaims> {
  if (!config.TEAMRUN_OIDC_ISSUER || !config.TEAMRUN_OIDC_AUDIENCE) {
    throw new ApiProblem(503, 'oidc_not_configured', 'OIDC authentication is not configured')
  }
  try {
    const keySet = await getKeySet(config.TEAMRUN_OIDC_ISSUER)
    const result = await jwtVerify(token, keySet, {
      issuer: config.TEAMRUN_OIDC_ISSUER,
      audience: config.TEAMRUN_OIDC_AUDIENCE
    })
    const subject = requireStringClaim(result.payload.sub, 'sub')
    const email = requireStringClaim(result.payload.email, 'email').toLowerCase()
    if (result.payload.email_verified === false) {
      throw new ApiProblem(401, 'unverified_email', 'Access token email is not verified')
    }
    const displayName =
      typeof result.payload.name === 'string' && result.payload.name.trim()
        ? result.payload.name.trim()
        : email
    return { subject, email, displayName }
  } catch (error) {
    if (error instanceof ApiProblem) {
      throw error
    }
    throw new ApiProblem(401, 'invalid_access_token', 'Access token could not be verified')
  }
}
