import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { teamFiles, teamFileVersions } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { requireTeamFile } from './team-file-access.js'

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

export function registerTeamFileGovernanceRoutes(app: FastifyInstance): void {
  app.post('/v1/file-versions/:versionId/clear-quarantine', async (request) => {
    const { versionId } = request.params as { versionId: string }
    const [version] = await app.teamRunDatabase
      .select()
      .from(teamFileVersions)
      .where(eq(teamFileVersions.id, versionId))
      .limit(1)
    if (!version) {
      throw new ApiProblem(404, 'team_file_version_not_found', 'Team File version was not found')
    }
    await requireOrganizationRole(
      app.teamRunDatabase,
      version.organizationId,
      request.teamRunUser.id,
      ['owner']
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/file-versions/${versionId}/clear-quarantine`,
      key,
      requestBody: {},
      execute: async (transaction) => {
        const [cleared] = await transaction
          .update(teamFileVersions)
          .set({ availability: 'available', quarantineReason: null })
          .where(eq(teamFileVersions.id, versionId))
          .returning(versionFields)
        if (!cleared) {
          throw new ApiProblem(
            404,
            'team_file_version_not_found',
            'Team File version was not found'
          )
        }
        await appendTeamEvent(transaction, {
          organizationId: version.organizationId,
          type: 'team_file.quarantine_cleared',
          entityId: version.id,
          actorUserId: request.teamRunUser.id,
          auditAction: 'team_file.quarantine_clear',
          data: { teamFileId: version.teamFileId, projectId: version.projectId }
        })
        return { status: 200, body: cleared }
      }
    })
    return result.body
  })

  app.delete('/v1/files/:teamFileId', async (request, reply) => {
    const { teamFileId } = request.params as { teamFileId: string }
    const teamFile = await requireTeamFile(app, teamFileId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      teamFile.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    await app.teamRunDatabase.transaction(async (transaction) => {
      await transaction
        .update(teamFiles)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(teamFiles.id, teamFileId))
      await appendTeamEvent(transaction, {
        organizationId: teamFile.organizationId,
        type: 'team_file.deleted',
        entityId: teamFile.id,
        actorUserId: request.teamRunUser.id,
        auditAction: 'team_file.delete',
        data: { projectId: teamFile.projectId }
      })
    })
    return reply.code(204).send()
  })
}
