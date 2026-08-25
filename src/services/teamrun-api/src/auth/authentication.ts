import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { organizationInvitations, organizationMembers, users } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'
import type { TeamRunUser } from '../http/fastify-context.js'
import { verifyOidcToken } from './oidc-token-verifier.js'
import { appendTeamEvent } from '../events/team-event-writer.js'

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
  const invitations = await app.teamRunDatabase
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.email, claims.email.toLowerCase()),
        eq(organizationInvitations.status, 'pending')
      )
    )
  if (invitations.length > 0) {
    await app.teamRunDatabase.transaction(async (transaction) => {
      for (const invitation of invitations) {
        if (invitation.expiresAt.getTime() <= Date.now()) continue
        await transaction
          .insert(organizationMembers)
          .values({
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role
          })
          .onConflictDoNothing()
        await transaction
          .update(organizationInvitations)
          .set({ status: 'accepted' })
          .where(eq(organizationInvitations.id, invitation.id))
        await appendTeamEvent(transaction, {
          organizationId: invitation.organizationId,
          type: 'organization.membership_changed',
          entityId: invitation.id,
          actorUserId: user.id,
          data: { userId: user.id, role: invitation.role }
        })
      }
    })
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
      claims = await verifyOidcToken(authorization.token, app.teamRunConfig)
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

export async function findUserByEmail(
  app: FastifyInstance,
  email: string
): Promise<TeamRunUser | null> {
  const [user] = await app.teamRunDatabase
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)
  return user ?? null
}
