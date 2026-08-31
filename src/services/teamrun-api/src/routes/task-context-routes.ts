import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  createContextSnapshotRequestSchema,
  createTaskCommentRequestSchema,
  externalTaskSourceSchema
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { renderTaskContext } from '../context/task-context-renderer.js'
import { loadTeamFileContext } from '../context/team-file-context.js'
import { agentRuns, contextSnapshots, projects, taskComments, tasks } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { requireTask } from './task-access.js'

export async function registerTaskContextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/tasks/:taskId/comments', async (request) => {
    const { taskId } = request.params as { taskId: string }
    await requireTask(app, taskId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(taskComments.createdAt, taskComments.id)
  })

  app.post('/v1/tasks/:taskId/comments', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = createTaskCommentRequestSchema.parse(request.body)
    const { task } = await requireTask(app, taskId, request.teamRunUser.id)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/tasks/${taskId}/comments`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [created] = await transaction
          .insert(taskComments)
          .values({
            organizationId: task.organizationId,
            taskId,
            authorUserId: request.teamRunUser.id,
            bodyMarkdown: body.bodyMarkdown
          })
          .returning()
        if (!created) {
          throw new ApiProblem(500, 'comment_create_failed', 'Comment was not created')
        }
        await transaction.update(agentRuns).set({ stale: true }).where(eq(agentRuns.taskId, taskId))
        await appendTeamEvent(transaction, {
          organizationId: task.organizationId,
          type: 'task.comment.created',
          entityId: created.id,
          actorUserId: request.teamRunUser.id,
          data: { taskId }
        })
        return { status: 201, body: created }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/tasks/:taskId/context-snapshots', async (request) => {
    const { taskId } = request.params as { taskId: string }
    await requireTask(app, taskId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(contextSnapshots)
      .where(eq(contextSnapshots.taskId, taskId))
      .orderBy(desc(contextSnapshots.createdAt))
  })

  app.post('/v1/tasks/:taskId/context-snapshots', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = createContextSnapshotRequestSchema.parse(request.body)
    const { task } = await requireTask(app, taskId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      task.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    if (task.version !== body.taskVersion) {
      throw new ApiProblem(409, 'task_version_conflict', 'Task changed before snapshot creation')
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/tasks/${taskId}/context-snapshots`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [lockedTask] = await transaction
          .select()
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .for('update')
        if (!lockedTask || lockedTask.version !== body.taskVersion) {
          throw new ApiProblem(
            409,
            'task_version_conflict',
            'Task changed before snapshot creation'
          )
        }
        const [project] = await transaction
          .select()
          .from(projects)
          .where(eq(projects.id, lockedTask.projectId))
        if (!project) {
          throw new ApiProblem(404, 'project_not_found', 'Project was not found')
        }
        const comments = body.includeComments
          ? await transaction
              .select()
              .from(taskComments)
              .where(eq(taskComments.taskId, taskId))
              .orderBy(taskComments.createdAt, taskComments.id)
          : []
        const externalSource = lockedTask.externalSource
          ? externalTaskSourceSchema.parse(lockedTask.externalSource)
          : null
        const files = await loadTeamFileContext(
          transaction,
          lockedTask.projectId,
          body.selectedTeamFileVersionIds,
          []
        )
        const rendered = renderTaskContext({
          projectKey: project.key,
          projectName: project.name,
          projectContextMarkdown: body.includeProjectContext ? project.contextMarkdown : null,
          task: { ...lockedTask, externalSource },
          comments: comments.map((comment) => ({
            ...comment,
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.updatedAt.toISOString()
          })),
          files,
          includeExternalSource: body.includeExternalSource
        })
        const [snapshot] = await transaction
          .insert(contextSnapshots)
          .values({
            organizationId: lockedTask.organizationId,
            taskId,
            taskVersion: lockedTask.version,
            projectContextVersion: body.includeProjectContext ? project.contextVersion : 0,
            commentWatermark: comments.at(-1)?.createdAt ?? null,
            teamFileVersionIds: files.map((file) => file.versionId),
            agentSelectedFileVersionIds: files
              .filter((file) => file.selectedBy === 'agent')
              .map((file) => file.versionId),
            autoEnrichmentRequested: body.autoEnrich,
            renderedMarkdown: rendered.markdown,
            hash: rendered.hash,
            createdByUserId: request.teamRunUser.id
          })
          .returning()
        if (!snapshot) {
          throw new ApiProblem(500, 'snapshot_create_failed', 'Context snapshot was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: lockedTask.organizationId,
          type: 'context_snapshot.created',
          entityId: snapshot.id,
          actorUserId: request.teamRunUser.id,
          data: {
            taskId,
            hash: rendered.hash,
            teamFileVersionIds: files.map((file) => file.versionId),
            autoEnrichmentRequested: body.autoEnrich
          }
        })
        return { status: 201, body: snapshot }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}
