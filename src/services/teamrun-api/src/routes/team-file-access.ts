import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { teamFiles } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export async function requireTeamFile(app: FastifyInstance, teamFileId: string, userId: string) {
  const [teamFile] = await app.teamRunDatabase
    .select()
    .from(teamFiles)
    .where(eq(teamFiles.id, teamFileId))
    .limit(1)
  if (!teamFile || teamFile.deletedAt) {
    throw new ApiProblem(404, 'team_file_not_found', 'Team File was not found')
  }
  await requireOrganizationRole(app.teamRunDatabase, teamFile.organizationId, userId)
  return teamFile
}
