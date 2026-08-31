import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireOrganizationRole } from '../auth/organization-access.js'
import {
  createTeamInviteCode,
  hashTeamInviteCode,
  normalizeTeamInviteCode,
  teamInviteCodeStatus
} from '../auth/team-invite-code.js'
import { organizationMembers, organizations, teamInviteCodes } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'

const redeemCodeSchema = z.object({ code: z.string().min(1).max(128) })

function publicInviteCode(row: typeof teamInviteCodes.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    codeHint: row.codeHint,
    status: teamInviteCodeStatus(row),
    createdByUserId: row.createdByUserId,
    redeemedByUserId: row.redeemedByUserId,
    expiresAt: row.expiresAt,
    redeemedAt: row.redeemedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt
  }
}

function assertRedeemable(row: typeof teamInviteCodes.$inferSelect | undefined): asserts row {
  if (!row) {
    throw new ApiProblem(404, 'invite_code_invalid', 'Invite code is invalid')
  }
  const status = teamInviteCodeStatus(row)
  if (status !== 'active') {
    throw new ApiProblem(409, `invite_code_${status}`, `Invite code is ${status}`)
  }
}

export async function registerTeamInviteCodeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/organizations/:organizationId/invite-codes', async (request) => {
    const { organizationId } = request.params as { organizationId: string }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner'
    ])
    const rows = await app.teamRunDatabase
      .select()
      .from(teamInviteCodes)
      .where(eq(teamInviteCodes.organizationId, organizationId))
      .orderBy(desc(teamInviteCodes.createdAt))
      .limit(100)
    return rows.map(publicInviteCode)
  })

  app.post('/v1/organizations/:organizationId/invite-codes', async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner'
    ])
    const generated = createTeamInviteCode()
    const row = await app.teamRunDatabase.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(teamInviteCodes)
        .values({
          organizationId,
          codeHash: generated.codeHash,
          codeHint: generated.codeHint,
          createdByUserId: request.teamRunUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
        .returning()
      if (!created) {
        throw new ApiProblem(500, 'invite_code_create_failed', 'Invite code was not created')
      }
      await appendTeamEvent(transaction, {
        organizationId,
        type: 'organization.invitation_created',
        entityId: created.id,
        actorUserId: request.teamRunUser.id,
        data: { kind: 'invite_code', codeHint: created.codeHint, action: 'created' },
        auditAction: 'organization.invite_code.created'
      })
      return created
    })
    return reply.code(201).send({ ...publicInviteCode(row), code: generated.code })
  })

  app.delete(
    '/v1/organizations/:organizationId/invite-codes/:inviteCodeId',
    async (request, reply) => {
      const { organizationId, inviteCodeId } = request.params as {
        organizationId: string
        inviteCodeId: string
      }
      await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
        'owner'
      ])
      await app.teamRunDatabase.transaction(async (transaction) => {
        const [row] = await transaction
          .update(teamInviteCodes)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(teamInviteCodes.id, inviteCodeId),
              eq(teamInviteCodes.organizationId, organizationId),
              isNull(teamInviteCodes.redeemedAt),
              isNull(teamInviteCodes.revokedAt)
            )
          )
          .returning()
        if (!row) {
          throw new ApiProblem(404, 'invite_code_not_found', 'Active invite code was not found')
        }
        await appendTeamEvent(transaction, {
          organizationId,
          type: 'organization.invitation_created',
          entityId: row.id,
          actorUserId: request.teamRunUser.id,
          data: { kind: 'invite_code', codeHint: row.codeHint, action: 'revoked' },
          auditAction: 'organization.invite_code.revoked'
        })
      })
      return reply.code(204).send()
    }
  )

  app.post('/v1/team-invite-codes/redeem', async (request, reply) => {
    const { code } = redeemCodeSchema.parse(request.body)
    const normalized = normalizeTeamInviteCode(code)
    if (!normalized) {
      throw new ApiProblem(404, 'invite_code_invalid', 'Invite code is invalid')
    }
    const organization = await app.teamRunDatabase.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(teamInviteCodes)
        .where(eq(teamInviteCodes.codeHash, hashTeamInviteCode(normalized)))
        .limit(1)
        .for('update')
      assertRedeemable(row)
      const [existing] = await transaction
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, row.organizationId),
            eq(organizationMembers.userId, request.teamRunUser.id)
          )
        )
        .limit(1)
      if (existing) {
        throw new ApiProblem(409, 'already_team_member', 'User is already a Team member')
      }
      await transaction.insert(organizationMembers).values({
        organizationId: row.organizationId,
        userId: request.teamRunUser.id,
        role: 'member'
      })
      await transaction
        .update(teamInviteCodes)
        .set({ redeemedByUserId: request.teamRunUser.id, redeemedAt: new Date() })
        .where(eq(teamInviteCodes.id, row.id))
      await appendTeamEvent(transaction, {
        organizationId: row.organizationId,
        type: 'organization.membership_changed',
        entityId: request.teamRunUser.id,
        actorUserId: request.teamRunUser.id,
        data: { userId: request.teamRunUser.id, role: 'member', action: 'joined_by_code' },
        auditAction: 'organization.member.joined_by_code'
      })
      const [joined] = await transaction
        .select()
        .from(organizations)
        .where(eq(organizations.id, row.organizationId))
        .limit(1)
      if (!joined) {
        throw new ApiProblem(404, 'organization_not_found', 'Team was not found')
      }
      return { ...joined, role: 'member' as const }
    })
    return reply.code(200).send(organization)
  })
}
