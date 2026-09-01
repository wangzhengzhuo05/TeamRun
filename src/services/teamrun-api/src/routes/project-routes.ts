import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  createProjectRequestSchema,
  createRepositoryRequestSchema,
  updateProjectRequestSchema
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { agentRuns, projects, repositories, tasks } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { requireProject } from './project-access.js'

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/organizations/:organizationId/projects', async (request) => {
    const { organizationId } = request.params as { organizationId: string }
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(projects.name)
  })

  app.post('/v1/organizations/:organizationId/projects', async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string }
    const body = createProjectRequestSchema.parse(request.body)
    await requireOrganizationRole(app.teamRunDatabase, organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/organizations/${organizationId}/projects`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [project] = await transaction
          .insert(projects)
          .values({ organizationId, ...body })
          .returning()
        if (!project) {
          throw new ApiProblem(500, 'project_create_failed', 'Project was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId,
          type: 'project.created',
          entityId: project.id,
          actorUserId: request.teamRunUser.id,
          auditAction: 'project.create'
        })
        return { status: 201, body: project }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.patch('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = updateProjectRequestSchema.parse(request.body)
    const current = await requireProject(app, projectId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      current.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    const changes = {
      ...body,
      ...(body.contextMarkdown !== undefined ? { contextVersion: current.contextVersion + 1 } : {}),
      updatedAt: new Date()
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `PATCH /v1/projects/${projectId}`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [project] = await transaction
          .update(projects)
          .set(changes)
          .where(eq(projects.id, projectId))
          .returning()
        if (body.contextMarkdown !== undefined) {
          await transaction
            .update(agentRuns)
            .set({ stale: true })
            .where(
              inArray(
                agentRuns.taskId,
                transaction
                  .select({ id: tasks.id })
                  .from(tasks)
                  .where(eq(tasks.projectId, projectId))
              )
            )
        }
        await appendTeamEvent(transaction, {
          organizationId: current.organizationId,
          type: 'project.updated',
          entityId: projectId,
          actorUserId: request.teamRunUser.id,
          auditAction: 'project.update'
        })
        return { status: 200, body: project }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/projects/:projectId/repositories', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(repositories)
      .where(eq(repositories.projectId, projectId))
      .orderBy(repositories.displayName)
  })

  app.post('/v1/projects/:projectId/repositories', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createRepositoryRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/repositories`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, projectId))
          .for('update')
        const [existing] = await transaction
          .select({ id: repositories.id })
          .from(repositories)
          .where(eq(repositories.projectId, projectId))
          .limit(1)
        if (existing) {
          throw new ApiProblem(
            409,
            'team_project_repository_limit',
            'The initial Team Project release supports one repository'
          )
        }
        const [repository] = await transaction
          .insert(repositories)
          .values({ projectId, ...body })
          .returning()
        return { status: 201, body: repository }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}
