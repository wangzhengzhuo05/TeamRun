import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { organizationMembers, organizations } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { registerOrganizationMemberRoutes } from './organization-member-routes.js'
import { registerTeamInviteCodeRoutes } from './team-invite-code-routes.js'

const createOrganizationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(160)
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
        await appendTeamEvent(transaction, {
          organizationId: organization.id,
          type: 'organization.membership_changed',
          entityId: request.teamRunUser.id,
          actorUserId: request.teamRunUser.id,
          data: { userId: request.teamRunUser.id, role: 'owner', action: 'created' }
        })
        return { status: 201, body: { ...organization, role: 'owner' as const } }
      }
    })
    reply.header('Idempotency-Replayed', result.replayed ? 'true' : 'false')
    return reply.code(result.status).send(result.body)
  })

  await registerOrganizationMemberRoutes(app)
  await registerTeamInviteCodeRoutes(app)
}
