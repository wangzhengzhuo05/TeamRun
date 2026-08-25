import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  createTaskRequestSchema,
  type TaskStatus,
  updateTaskRequestSchema
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import {
  agentRuns,
  organizationMembers,
  projects,
  repositories,
  tasks
} from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import {
  requireIdempotencyKey,
  runIdempotentMutation,
  type TeamRunTransaction
} from '../http/idempotent-mutation.js'
import { requireTask } from './task-access.js'

const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress', 'canceled'],
  in_progress: ['in_review', 'canceled'],
  in_review: ['in_progress', 'done', 'canceled'],
  done: [],
  canceled: []
}

async function validateRepository(
  transaction: TeamRunTransaction,
  projectId: string,
  repositoryId: string | null | undefined
): Promise<void> {
  if (!repositoryId) {
    return
  }
  const [repository] = await transaction
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.id, repositoryId), eq(repositories.projectId, projectId)))
    .limit(1)
  if (!repository) {
    throw new ApiProblem(400, 'repository_project_mismatch', 'Repository is not in this project')
  }
}

async function validateOwner(
  transaction: TeamRunTransaction,
  organizationId: string,
  ownerUserId: string
): Promise<void> {
  const [member] = await transaction
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, ownerUserId)
      )
    )
    .limit(1)
  if (!member) {
    throw new ApiProblem(400, 'task_owner_not_member', 'Task owner is not in this organization')
  }
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const [project] = await app.teamRunDatabase
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!project) {
      throw new ApiProblem(404, 'project_not_found', 'Project was not found')
    }
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id
    )
    return app.teamRunDatabase
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(desc(tasks.updatedAt))
  })

  app.post('/v1/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createTaskRequestSchema.parse(request.body)
    const [project] = await app.teamRunDatabase
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
    if (!project) {
      throw new ApiProblem(404, 'project_not_found', 'Project was not found')
    }
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/tasks`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        await validateRepository(transaction, projectId, body.repositoryId)
        const ownerUserId = body.ownerUserId ?? request.teamRunUser.id
        await validateOwner(transaction, project.organizationId, ownerUserId)
        const [counter] = await transaction
          .update(projects)
          .set({ nextTaskNumber: sql`${projects.nextTaskNumber} + 1`, updatedAt: new Date() })
          .where(eq(projects.id, projectId))
          .returning({ nextTaskNumber: projects.nextTaskNumber })
        if (!counter) {
          throw new ApiProblem(404, 'project_not_found', 'Project was not found')
        }
        const externalSource = body.externalSource
          ? { ...body.externalSource, importedAt: new Date().toISOString() }
          : null
        const [task] = await transaction
          .insert(tasks)
          .values({
            organizationId: project.organizationId,
            projectId,
            repositoryId: body.repositoryId ?? null,
            number: counter.nextTaskNumber - 1,
            title: body.title,
            descriptionMarkdown: body.descriptionMarkdown,
            ownerUserId,
            externalSource
          })
          .returning()
        if (!task) {
          throw new ApiProblem(500, 'task_create_failed', 'Task was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: 'task.created',
          entityId: task.id,
          actorUserId: request.teamRunUser.id,
          auditAction: 'task.create'
        })
        return { status: 201, body: task }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/tasks/:taskId', async (request) => {
    const { taskId } = request.params as { taskId: string }
    return (await requireTask(app, taskId, request.teamRunUser.id)).task
  })

  app.patch('/v1/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = updateTaskRequestSchema.parse(request.body)
    const { task, role } = await requireTask(app, taskId, request.teamRunUser.id)
    if (body.status && body.status !== task.status) {
      if (!allowedTaskTransitions[task.status].includes(body.status)) {
        throw new ApiProblem(409, 'invalid_task_transition', 'Task status transition is invalid')
      }
      if (
        (body.status === 'done' || body.status === 'canceled') &&
        task.ownerUserId !== request.teamRunUser.id &&
        role !== 'admin' &&
        role !== 'owner'
      ) {
        throw new ApiProblem(
          403,
          'task_close_forbidden',
          'Only the task owner or admin can close it'
        )
      }
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `PATCH /v1/tasks/${taskId}`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        await validateRepository(transaction, task.projectId, body.repositoryId)
        if (body.ownerUserId) {
          await validateOwner(transaction, task.organizationId, body.ownerUserId)
        }
        const { version, ...changes } = body
        const [updated] = await transaction
          .update(tasks)
          .set({ ...changes, version: version + 1, updatedAt: new Date() })
          .where(and(eq(tasks.id, taskId), eq(tasks.version, version)))
          .returning()
        if (!updated) {
          throw new ApiProblem(409, 'task_version_conflict', 'Task was updated by another member')
        }
        await transaction.update(agentRuns).set({ stale: true }).where(eq(agentRuns.taskId, taskId))
        await appendTeamEvent(transaction, {
          organizationId: task.organizationId,
          type: 'task.updated',
          entityId: taskId,
          actorUserId: request.teamRunUser.id,
          data: { version: updated.version },
          auditAction: 'task.update'
        })
        return { status: 200, body: updated }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}
