import type { FastifyInstance } from 'fastify'
import { users } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'
import type { TeamRunUser } from '../http/fastify-context.js'
import { verifyOidcToken } from './oidc-token-verifier.js'
import { matchesTeamRunSharedKey, teamRunSharedKeyIdentity } from './shared-key-authentication.js'

type IdentityClaims = {
  subject: string
  email: string
  displayName: string
}

function parseAuthorization(value: string | undefined): { scheme: string; token: string } {
  const [scheme, token, ...rest] = value?.trim().split(/\s+/) ?? []
  if (!scheme || !token || rest.length > 0) {
    throw new ApiProblem(401, 'authentication_required', 'Authorization header is required')
  }
  return { scheme, token }
}

function parseDevIdentity(token: string): IdentityClaims {
  const email = token.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiProblem(401, 'invalid_dev_identity', 'Dev identity must be an email address')
  }
  return { subject: `dev:${email}`, email, displayName: email.split('@')[0] ?? email }
}

async function upsertUser(app: FastifyInstance, claims: IdentityClaims): Promise<TeamRunUser> {
  const [user] = await app.teamRunDatabase
    .insert(users)
    .values({
      oidcSubject: claims.subject,
      email: claims.email,
      displayName: claims.displayName
    })
    .onConflictDoUpdate({
      target: users.oidcSubject,
      set: {
        email: claims.email,
        displayName: claims.displayName,
        updatedAt: new Date()
      }
    })
    .returning()
  if (!user) {
    throw new ApiProblem(500, 'user_upsert_failed', 'Authenticated user could not be loaded')
  }
  return user
}

export function registerAuthentication(app: FastifyInstance): void {
  app.decorateRequest('teamRunUser', null as unknown as TeamRunUser)
  app.decorate('authenticateTeamRunRequest', async (request) => {
    const authorization = parseAuthorization(request.headers.authorization)
    let claims: IdentityClaims
    if (authorization.scheme.toLowerCase() === 'dev') {
      if (app.teamRunConfig.TEAMRUN_DEV_AUTH !== '1') {
        throw new ApiProblem(401, 'dev_auth_disabled', 'Development authentication is disabled')
      }
      claims = parseDevIdentity(authorization.token)
    } else if (authorization.scheme.toLowerCase() === 'bearer') {
      const sharedKey = app.teamRunConfig.TEAMRUN_SHARED_KEY
      if (sharedKey && matchesTeamRunSharedKey(authorization.token, sharedKey)) {
        claims = teamRunSharedKeyIdentity(app.teamRunConfig)
      } else if (
        app.teamRunConfig.TEAMRUN_OIDC_ISSUER &&
        app.teamRunConfig.TEAMRUN_OIDC_AUDIENCE &&
        app.teamRunConfig.TEAMRUN_OIDC_CLIENT_ID
      ) {
        claims = await verifyOidcToken(authorization.token, app.teamRunConfig)
      } else if (sharedKey) {
        throw new ApiProblem(401, 'invalid_shared_key', 'Team key is invalid')
      } else {
        claims = await verifyOidcToken(authorization.token, app.teamRunConfig)
      }
    } else {
      throw new ApiProblem(401, 'unsupported_authentication', 'Unsupported authorization scheme')
    }
    request.teamRunUser = await upsertUser(app, claims)
  })

  app.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.config.public === true) {
      return
    }
    await app.authenticateTeamRunRequest(request, reply)
  })
}
