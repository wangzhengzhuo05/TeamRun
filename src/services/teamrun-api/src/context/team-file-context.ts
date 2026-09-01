import { eq, inArray } from 'drizzle-orm'
import type { TeamRunTransaction } from '../http/idempotent-mutation.js'
import { teamFiles, teamFileVersions } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export type TeamFileContextEntry = {
  versionId: string
  path: string
  version: number
  mimeType: string
  sha256: string
  content: string
  selectedBy: 'member' | 'agent'
}

function supportsTextContext(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    [
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml'
    ].includes(mimeType)
  )
}

export async function loadTeamFileContext(
  transaction: TeamRunTransaction,
  projectId: string,
  selectedIds: string[],
  agentSelectedIds: string[]
): Promise<TeamFileContextEntry[]> {
  const ids = [...new Set([...selectedIds, ...agentSelectedIds])]
  if (ids.length === 0) {
    return []
  }
  const rows = await transaction
    .select({
      id: teamFileVersions.id,
      projectId: teamFileVersions.projectId,
      path: teamFiles.path,
      version: teamFileVersions.version,
      mimeType: teamFileVersions.mimeType,
      sha256: teamFileVersions.sha256,
      contentBase64: teamFileVersions.contentBase64,
      availability: teamFileVersions.availability,
      deletedAt: teamFiles.deletedAt
    })
    .from(teamFileVersions)
    .innerJoin(teamFiles, eq(teamFiles.id, teamFileVersions.teamFileId))
    .where(inArray(teamFileVersions.id, ids))
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => {
    const row = rowsById.get(id)
    if (!row || row.projectId !== projectId || row.deletedAt) {
      throw new ApiProblem(400, 'team_file_version_invalid', 'Selected Team File is unavailable')
    }
    if (row.availability !== 'available') {
      throw new ApiProblem(
        423,
        'team_file_quarantined',
        'Quarantined Team Files cannot be included in task context'
      )
    }
    if (!supportsTextContext(row.mimeType)) {
      throw new ApiProblem(
        400,
        'team_file_context_unsupported',
        'Only text Team Files can be included in task context'
      )
    }
    return {
      versionId: row.id,
      path: row.path,
      version: row.version,
      mimeType: row.mimeType,
      sha256: row.sha256,
      content: Buffer.from(row.contentBase64, 'base64').toString('utf8'),
      selectedBy: agentSelectedIds.includes(id) ? 'agent' : 'member'
    }
  })
}
