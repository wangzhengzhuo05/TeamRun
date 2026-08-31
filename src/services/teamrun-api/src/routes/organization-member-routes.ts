import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { organizationRoleSchema } from '@teamrun/contracts'
import { z } from 'zod'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { organizationMembers, users } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'

const memberRoleChangeSchema = z.object({
  role: organizationRoleSchema.exclude(['owner'])
})

async function targetMembership(app: FastifyInstance, organizationId: string, userId: string) {
  const [membership] = await app.teamRunDatabase
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1)
  if (!membership) {
    throw new ApiProblem(404, 'member_not_found', 'Team member was not found')
  }
  if (membership.role === 'owner') {
    throw new ApiProblem(409, 'owner_change_forbidden', 'Team owner cannot be changed')
  }
}

export async function registerOrganizationMemberRoutes(app: FastifyInstance): Promise<void> {
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

  app.patch('/v1/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params as {
      organizationId: string
      userId: string
    }
    const { role } = memberRoleChangeSchema.parse(request.body)
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner'
    ])
    await targetMembership(app, organizationId, userId)
    await app.teamRunDatabase.transaction(async (transaction) => {
      await transaction
        .update(organizationMembers)
        .set({ role })
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId)
          )
        )
      await appendTeamEvent(transaction, {
        organizationId,
        type: 'organization.membership_changed',
        entityId: userId,
        actorUserId: request.teamRunUser.id,
        data: { userId, role, action: 'role_changed' },
        auditAction: 'organization.member.role_changed'
      })
    })
    return reply.code(204).send()
  })

  app.delete('/v1/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params as {
      organizationId: string
      userId: string
    }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner'
    ])
    await targetMembership(app, organizationId, userId)
    await app.teamRunDatabase.transaction(async (transaction) => {
      await transaction
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId)
          )
        )
      await appendTeamEvent(transaction, {
        organizationId,
        type: 'organization.membership_changed',
        entityId: userId,
        actorUserId: request.teamRunUser.id,
        data: { userId, action: 'removed' },
        auditAction: 'organization.member.removed'
      })
    })
    return reply.code(204).send()
  })
}
