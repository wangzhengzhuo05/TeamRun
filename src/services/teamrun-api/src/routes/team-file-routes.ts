import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createTeamFileRequestSchema, createTeamFileVersionRequestSchema } from '@teamrun/contracts'
import { teamFiles, teamFileVersions } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { inspectTeamFileContent } from '../files/team-file-inspection.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { requireProject } from './project-access.js'
import { requireTeamFile } from './team-file-access.js'
import { registerTeamFileGovernanceRoutes } from './team-file-governance-routes.js'

const versionFields = {
  id: teamFileVersions.id,
  organizationId: teamFileVersions.organizationId,
  projectId: teamFileVersions.projectId,
  teamFileId: teamFileVersions.teamFileId,
  version: teamFileVersions.version,
  mimeType: teamFileVersions.mimeType,
  sizeBytes: teamFileVersions.sizeBytes,
  sha256: teamFileVersions.sha256,
  availability: teamFileVersions.availability,
  quarantineReason: teamFileVersions.quarantineReason,
  createdByUserId: teamFileVersions.createdByUserId,
  createdAt: teamFileVersions.createdAt
}

const fileFields = {
  id: teamFiles.id,
  organizationId: teamFiles.organizationId,
  projectId: teamFiles.projectId,
  path: teamFiles.path,
  kind: teamFiles.kind,
  currentVersion: teamFiles.currentVersion,
  currentVersionId: teamFileVersions.id,
  currentMimeType: teamFiles.currentMimeType,
  currentAvailability: teamFileVersions.availability,
  currentSha256: teamFileVersions.sha256,
  currentSizeBytes: teamFileVersions.sizeBytes,
  createdByUserId: teamFiles.createdByUserId,
  createdAt: teamFiles.createdAt,
  updatedAt: teamFiles.updatedAt
}

function inspectContent(contentBase64: string) {
  try {
    return inspectTeamFileContent(contentBase64)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'team_file_content_invalid'
    if (code === 'team_file_too_large') {
      throw new ApiProblem(413, code, 'Team Files are limited to 512 KiB per version')
    }
    throw new ApiProblem(400, 'team_file_content_invalid', 'Team File content is not valid base64')
  }
}

export async function registerTeamFileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects/:projectId/files', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select(fileFields)
      .from(teamFiles)
      .innerJoin(
        teamFileVersions,
        and(
          eq(teamFileVersions.teamFileId, teamFiles.id),
          eq(teamFileVersions.version, teamFiles.currentVersion)
        )
      )
      .where(and(eq(teamFiles.projectId, projectId), isNull(teamFiles.deletedAt)))
      .orderBy(teamFiles.path)
  })

  app.post('/v1/projects/:projectId/files', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createTeamFileRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    const inspected = inspectContent(body.contentBase64)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/files`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [teamFile] = await transaction
          .insert(teamFiles)
          .values({
            organizationId: project.organizationId,
            projectId,
            path: body.path,
            kind: body.kind,
            currentMimeType: body.mimeType,
            createdByUserId: request.teamRunUser.id
          })
          .onConflictDoNothing()
          .returning()
        if (!teamFile) {
          throw new ApiProblem(409, 'team_file_path_conflict', 'A Team File already uses this path')
        }
        const [version] = await transaction
          .insert(teamFileVersions)
          .values({
            organizationId: project.organizationId,
            projectId,
            teamFileId: teamFile.id,
            version: 1,
            mimeType: body.mimeType,
            sizeBytes: inspected.bytes.byteLength,
            sha256: inspected.sha256,
            contentBase64: body.contentBase64,
            availability: inspected.availability,
            quarantineReason: inspected.quarantineReason,
            createdByUserId: request.teamRunUser.id
          })
          .returning({ id: teamFileVersions.id })
        if (!version) {
          throw new ApiProblem(500, 'team_file_version_create_failed', 'File version was not saved')
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: 'team_file.created',
          entityId: teamFile.id,
          actorUserId: request.teamRunUser.id,
          data: { projectId, version: 1, availability: inspected.availability }
        })
        return {
          status: 201,
          body: {
            ...teamFile,
            currentVersionId: version.id,
            currentAvailability: inspected.availability,
            currentSha256: inspected.sha256,
            currentSizeBytes: inspected.bytes.byteLength
          }
        }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/files/:teamFileId/versions', async (request) => {
    const { teamFileId } = request.params as { teamFileId: string }
    await requireTeamFile(app, teamFileId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select(versionFields)
      .from(teamFileVersions)
      .where(eq(teamFileVersions.teamFileId, teamFileId))
      .orderBy(desc(teamFileVersions.version))
  })

  app.get('/v1/file-versions/:versionId', async (request) => {
    const { versionId } = request.params as { versionId: string }
    const [version] = await app.teamRunDatabase
      .select()
      .from(teamFileVersions)
      .where(eq(teamFileVersions.id, versionId))
      .limit(1)
    if (!version) {
      throw new ApiProblem(404, 'team_file_version_not_found', 'Team File version was not found')
    }
    await requireTeamFile(app, version.teamFileId, request.teamRunUser.id)
    if (version.availability !== 'available') {
      throw new ApiProblem(
        423,
        'team_file_quarantined',
        'Team File version must be cleared before it can be read'
      )
    }
    return version
  })

  app.post('/v1/files/:teamFileId/versions', async (request, reply) => {
    const { teamFileId } = request.params as { teamFileId: string }
    const body = createTeamFileVersionRequestSchema.parse(request.body)
    const current = await requireTeamFile(app, teamFileId, request.teamRunUser.id)
    const inspected = inspectContent(body.contentBase64)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/files/${teamFileId}/versions`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [locked] = await transaction
          .select()
          .from(teamFiles)
          .where(eq(teamFiles.id, teamFileId))
          .for('update')
        if (!locked || locked.deletedAt) {
          throw new ApiProblem(404, 'team_file_not_found', 'Team File was not found')
        }
        if (locked.currentVersion !== body.expectedCurrentVersion) {
          throw new ApiProblem(409, 'team_file_version_conflict', 'Team File changed before save')
        }
        const nextVersion = locked.currentVersion + 1
        const [version] = await transaction
          .insert(teamFileVersions)
          .values({
            organizationId: locked.organizationId,
            projectId: locked.projectId,
            teamFileId,
            version: nextVersion,
            mimeType: body.mimeType,
            sizeBytes: inspected.bytes.byteLength,
            sha256: inspected.sha256,
            contentBase64: body.contentBase64,
            availability: inspected.availability,
            quarantineReason: inspected.quarantineReason,
            createdByUserId: request.teamRunUser.id
          })
          .returning(versionFields)
        await transaction
          .update(teamFiles)
          .set({
            currentVersion: nextVersion,
            currentMimeType: body.mimeType,
            updatedAt: new Date()
          })
          .where(eq(teamFiles.id, teamFileId))
        if (!version) {
          throw new ApiProblem(500, 'team_file_version_create_failed', 'File version was not saved')
        }
        await appendTeamEvent(transaction, {
          organizationId: locked.organizationId,
          type: 'team_file.version_created',
          entityId: version.id,
          actorUserId: request.teamRunUser.id,
          data: { teamFileId, projectId: current.projectId, version: nextVersion }
        })
        return { status: 201, body: version }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  registerTeamFileGovernanceRoutes(app)
}
