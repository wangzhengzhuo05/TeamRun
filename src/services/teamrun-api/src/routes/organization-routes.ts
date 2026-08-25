import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { organizationRoleSchema } from '@teamrun/contracts'
import { z } from 'zod'
import { findUserByEmail } from '../auth/authentication.js'
import { requireOrganizationRole } from '../auth/organization-access.js'
import {
  organizationMembers,
  organizationInvitations,
  organizations,
  users
} from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { appendTeamEvent } from '../events/team-event-writer.js'

const createOrganizationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(160)
})

const addMemberSchema = z.object({
  email: z.email(),
  role: organizationRoleSchema.exclude(['owner'])
})

export async function registerOrganizationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/organizations', async (request) => {
    return app.teamRunDatabase
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt
      })
      .from(organizations)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizations.id),
          eq(organizationMembers.userId, request.teamRunUser.id)
        )
      )
      .orderBy(organizations.name)
  })

  app.post('/v1/organizations', async (request, reply) => {
    const body = createOrganizationSchema.parse(request.body)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: 'POST /v1/organizations',
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [organization] = await transaction.insert(organizations).values(body).returning()
        if (!organization) {
          throw new ApiProblem(500, 'organization_create_failed', 'Organization was not created')
        }
        await transaction.insert(organizationMembers).values({
          organizationId: organization.id,
          userId: request.teamRunUser.id,
          role: 'owner'
        })
        return { status: 201, body: { ...organization, role: 'owner' } }
      }
    })
    reply.header('Idempotency-Replayed', result.replayed ? 'true' : 'false')
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/organizations/:organizationId/members', async (request) => {
    const { organizationId } = request.params as { organizationId: string }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(users.displayName)
  })

  app.post('/v1/organizations/:organizationId/members', async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string }
    const body = addMemberSchema.parse(request.body)
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    const user = await findUserByEmail(app, body.email)
    if (!user) {
      throw new ApiProblem(
        409,
        'member_has_not_signed_in',
        'The member must sign in to TeamRun before being added'
      )
    }
    const [membership] = await app.teamRunDatabase
      .insert(organizationMembers)
      .values({ organizationId, userId: user.id, role: body.role })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: { role: body.role }
      })
      .returning()
    return reply.code(201).send({ ...membership, email: user.email, displayName: user.displayName })
  })

  app.delete('/v1/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params as {
      organizationId: string
      userId: string
    }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    const [target] = await app.teamRunDatabase
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1)
    if (target?.role === 'owner') {
      throw new ApiProblem(409, 'owner_removal_forbidden', 'Organization owner cannot be removed')
    }
    await app.teamRunDatabase
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId)
        )
      )
    return reply.code(204).send()
  })

  app.get('/v1/organizations/:organizationId/invitations', async (request) => {
    const { organizationId } = request.params as { organizationId: string }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    return app.teamRunDatabase
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.organizationId, organizationId))
      .orderBy(organizationInvitations.createdAt)
  })

  app.post('/v1/organizations/:organizationId/invitations', async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string }
    const body = addMemberSchema.parse(request.body)
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/organizations/${organizationId}/invitations`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [invitation] = await transaction
          .insert(organizationInvitations)
          .values({
            organizationId,
            email: body.email.toLowerCase(),
            role: body.role,
            invitedByUserId: request.teamRunUser.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
          .onConflictDoUpdate({
            target: [organizationInvitations.organizationId, organizationInvitations.email],
            targetWhere: eq(organizationInvitations.status, 'pending'),
            set: { role: body.role, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
          })
          .returning()
        if (!invitation)
          throw new ApiProblem(500, 'invitation_create_failed', 'Invitation was not created')
        await appendTeamEvent(transaction, {
          organizationId,
          type: 'organization.invitation_created',
          entityId: invitation.id,
          actorUserId: request.teamRunUser.id,
          data: { email: invitation.email, role: invitation.role },
          auditAction: 'organization.invitation_created'
        })
        return { status: 201, body: invitation }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.delete(
    '/v1/organizations/:organizationId/invitations/:invitationId',
    async (request, reply) => {
      const { organizationId, invitationId } = request.params as {
        organizationId: string
        invitationId: string
      }
      await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
        'owner',
        'admin'
      ])
      await app.teamRunDatabase
        .update(organizationInvitations)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(organizationInvitations.id, invitationId),
            eq(organizationInvitations.organizationId, organizationId),
            eq(organizationInvitations.status, 'pending')
          )
        )
      return reply.code(204).send()
    }
  )
}
