import { and, eq, max, ne, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  finalizePublicationRequestSchema,
  preparePublicationRequestSchema,
  type ResultPublication
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { agentRuns, publications, tasks } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { PublicationObjectStore } from '../publications/publication-object-store.js'

type StoredArtifact = {
  clientArtifactId: string
  kind: string
  fileName: string
  contentType: string
  byteSize: number
  sha256: string
  objectKey: string
}

function finalizedPublication(row: typeof publications.$inferSelect): ResultPublication {
  if (!row.revision || !row.publishedAt) {
    throw new ApiProblem(409, 'publication_not_finalized', 'Publication is not finalized')
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    agentRunId: row.agentRunId,
    revision: row.revision,
    summaryMarkdown: row.summaryMarkdown,
    headRevision: row.headRevision,
    commitGitObjectIds: row.commitGitObjectIds as string[],
    reviewUrl: row.reviewUrl,
    publishedByUserId: row.publishedByUserId,
    publishedAt: row.publishedAt.toISOString()
  }
}

export async function registerPublicationRoutes(app: FastifyInstance): Promise<void> {
  const objectStore = new PublicationObjectStore(app.teamRunConfig)
  await objectStore.ensureBucket(app.teamRunConfig.NODE_ENV !== 'production')

  app.post('/v1/publications/prepare', async (request, reply) => {
    const body = preparePublicationRequestSchema.parse(request.body)
    const [run] = await app.teamRunDatabase
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, body.agentRunId))
    if (!run) {
      throw new ApiProblem(404, 'agent_run_not_found', 'Agent run was not found')
    }
    await requireOrganizationRole(app.teamRunDatabase, run.organizationId, request.teamRunUser.id, [
      'owner',
      'admin'
    ])
    if (run.ownerUserId !== request.teamRunUser.id) {
      throw new ApiProblem(403, 'publication_forbidden', 'Only the run owner can publish it')
    }
    if (run.status !== 'review') {
      throw new ApiProblem(409, 'run_not_in_review', 'Agent run must be ready for review')
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: 'POST /v1/publications/prepare',
      key,
      requestBody: body,
      execute: async (transaction) => {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        const [publication] = await transaction
          .insert(publications)
          .values({
            organizationId: run.organizationId,
            taskId: run.taskId,
            agentRunId: run.id,
            summaryMarkdown: body.summaryMarkdown,
            headRevision: body.headRevision,
            commitGitObjectIds: body.commitGitObjectIds,
            reviewUrl: body.reviewUrl ?? null,
            artifacts: [],
            publishedByUserId: request.teamRunUser.id,
            expiresAt
          })
          .returning()
        if (!publication) {
          throw new ApiProblem(500, 'publication_prepare_failed', 'Publication was not prepared')
        }
        const uploads = await Promise.all(
          body.artifacts.map(async (artifact) => ({
            artifact,
            upload: await objectStore.prepareUpload({
              publicationId: publication.id,
              clientArtifactId: artifact.clientArtifactId,
              contentType: artifact.contentType,
              byteSize: artifact.byteSize,
              sha256: artifact.sha256
            })
          }))
        )
        const storedArtifacts: StoredArtifact[] = uploads.map(({ artifact, upload }) => ({
          ...artifact,
          objectKey: upload.objectKey
        }))
        await transaction
          .update(publications)
          .set({ artifacts: storedArtifacts, updatedAt: new Date() })
          .where(eq(publications.id, publication.id))
        return {
          status: 201,
          body: {
            publicationId: publication.id,
            expiresAt: expiresAt.toISOString(),
            uploads: uploads.map(({ artifact, upload }) => ({
              ...artifact,
              uploadUrl: upload.uploadUrl,
              requiredHeaders: upload.requiredHeaders
            }))
          }
        }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/v1/publications/:publicationId/finalize', async (request, reply) => {
    const { publicationId } = request.params as { publicationId: string }
    const body = finalizePublicationRequestSchema.parse(request.body)
    const [publication] = await app.teamRunDatabase
      .select()
      .from(publications)
      .where(eq(publications.id, publicationId))
    if (!publication) {
      throw new ApiProblem(404, 'publication_not_found', 'Publication was not found')
    }
    await requireOrganizationRole(
      app.teamRunDatabase,
      publication.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    if (publication.publishedByUserId !== request.teamRunUser.id) {
      throw new ApiProblem(403, 'publication_forbidden', 'Only the publisher can finalize it')
    }
    if (publication.state === 'finalized') {
      return finalizedPublication(publication)
    }
    if (publication.expiresAt.getTime() <= Date.now()) {
      throw new ApiProblem(410, 'publication_expired', 'Prepared publication has expired')
    }
    const artifacts = publication.artifacts as StoredArtifact[]
    const receipts = new Map(
      body.artifactReceipts.map((receipt) => [receipt.clientArtifactId, receipt])
    )
    if (
      receipts.size !== artifacts.length ||
      artifacts.some(
        (artifact) => receipts.get(artifact.clientArtifactId)?.sha256 !== artifact.sha256
      )
    ) {
      throw new ApiProblem(
        409,
        'artifact_receipt_mismatch',
        'Artifact receipts do not match the confirmed publication'
      )
    }
    await Promise.all(
      artifacts.map((artifact) =>
        objectStore.verifyUpload({
          objectKey: artifact.objectKey,
          byteSize: artifact.byteSize,
          sha256: artifact.sha256
        })
      )
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/publications/${publicationId}/finalize`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [current] = await transaction
          .select()
          .from(publications)
          .where(eq(publications.id, publicationId))
          .for('update')
        if (!current) {
          throw new ApiProblem(404, 'publication_not_found', 'Publication was not found')
        }
        if (current.state === 'finalized') {
          return { status: 200, body: finalizedPublication(current) }
        }
        await transaction
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.id, current.taskId))
          .for('update')
        const [existingRunResult] = await transaction
          .select({ id: publications.id })
          .from(publications)
          .where(
            and(
              eq(publications.agentRunId, current.agentRunId),
              eq(publications.state, 'finalized'),
              ne(publications.id, current.id)
            )
          )
          .limit(1)
        if (existingRunResult) {
          throw new ApiProblem(409, 'agent_run_already_published', 'Agent run is already published')
        }
        const [revisionResult] = await transaction
          .select({ revision: max(publications.revision) })
          .from(publications)
          .where(and(eq(publications.taskId, current.taskId), eq(publications.state, 'finalized')))
        const publishedAt = new Date()
        const [updated] = await transaction
          .update(publications)
          .set({
            state: 'finalized',
            revision: (revisionResult?.revision ?? 0) + 1,
            publishedAt,
            updatedAt: publishedAt
          })
          .where(eq(publications.id, publicationId))
          .returning()
        if (!updated) {
          throw new ApiProblem(500, 'publication_finalize_failed', 'Publication was not finalized')
        }
        await transaction
          .update(agentRuns)
          .set({ status: 'completed', completedAt: publishedAt, updatedAt: publishedAt })
          .where(eq(agentRuns.id, current.agentRunId))
        await transaction
          .update(tasks)
          .set({
            status: 'in_review',
            version: sql`${tasks.version} + 1`,
            updatedAt: publishedAt
          })
          .where(eq(tasks.id, current.taskId))
        await appendTeamEvent(transaction, {
          organizationId: current.organizationId,
          type: 'publication.finalized',
          entityId: publicationId,
          actorUserId: request.teamRunUser.id,
          data: {
            taskId: current.taskId,
            agentRunId: current.agentRunId,
            revision: updated.revision
          },
          auditAction: 'publication.finalize'
        })
        return { status: 200, body: finalizedPublication(updated) }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/tasks/:taskId/publications', async (request) => {
    const { taskId } = request.params as { taskId: string }
    const [task] = await app.teamRunDatabase.select().from(tasks).where(eq(tasks.id, taskId))
    if (!task) {
      throw new ApiProblem(404, 'task_not_found', 'Task was not found')
    }
    await requireOrganizationRole(app.teamRunDatabase, task.organizationId, request.teamRunUser.id)
    const rows = await app.teamRunDatabase
      .select()
      .from(publications)
      .where(and(eq(publications.taskId, taskId), eq(publications.state, 'finalized')))
      .orderBy(publications.revision)
    return rows.map(finalizedPublication)
  })

  app.get('/v1/publications/:publicationId/artifacts', async (request) => {
    const { publicationId } = request.params as { publicationId: string }
    const [publication] = await app.teamRunDatabase
      .select()
      .from(publications)
      .where(eq(publications.id, publicationId))
    if (!publication || publication.state !== 'finalized') {
      throw new ApiProblem(404, 'publication_not_found', 'Published result was not found')
    }
    await requireOrganizationRole(
      app.teamRunDatabase,
      publication.organizationId,
      request.teamRunUser.id
    )
    return Promise.all(
      (publication.artifacts as StoredArtifact[]).map(async ({ objectKey, ...artifact }) => ({
        ...artifact,
        ...(await objectStore.prepareDownload(objectKey, artifact.fileName))
      }))
    )
  })
}
