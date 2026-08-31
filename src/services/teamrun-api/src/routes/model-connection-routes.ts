import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createModelConnectionRequestSchema } from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { modelConnections } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { sendTeamServerRuntimeRequest } from '../team-server/team-server-runtime-client.js'
import { requireProject } from './project-access.js'
import { requireTeamServerBinding } from './team-server-routes.js'

export async function registerModelConnectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects/:projectId/model-connections', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(modelConnections)
      .where(eq(modelConnections.projectId, projectId))
      .orderBy(modelConnections.name)
  })

  app.post('/v1/projects/:projectId/model-connections', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createModelConnectionRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id,
      ['owner']
    )
    const { pairing } = await requireTeamServerBinding(app, projectId)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/model-connections`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [connection] = await transaction
          .insert(modelConnections)
          .values({
            organizationId: project.organizationId,
            projectId,
            name: body.name,
            baseUrl: body.baseUrl,
            model: body.model,
            keyConfigured: false,
            createdByUserId: request.teamRunUser.id
          })
          .returning()
        if (!connection) {
          throw new ApiProblem(
            500,
            'model_connection_create_failed',
            'Model Connection was not created'
          )
        }
        await sendTeamServerRuntimeRequest(
          pairing,
          'teamrun.modelConnection.configure',
          {
            connectionId: connection.id,
            baseUrl: body.baseUrl,
            apiKey: body.apiKey,
            model: body.model
          },
          15_000
        )
        const [configured] = await transaction
          .update(modelConnections)
          .set({ keyConfigured: true, updatedAt: new Date() })
          .where(eq(modelConnections.id, connection.id))
          .returning()
        if (!configured) {
          throw new ApiProblem(
            500,
            'model_connection_create_failed',
            'Model Connection was not configured'
          )
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: 'model_connection.created',
          entityId: configured.id,
          actorUserId: request.teamRunUser.id,
          data: { projectId, model: configured.model }
        })
        return { status: 201, body: configured }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}
