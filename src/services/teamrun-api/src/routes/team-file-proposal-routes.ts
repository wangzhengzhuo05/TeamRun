import { createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  createTeamFileProposalRequestSchema,
  TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY
} from '@teamrun/contracts'
import { teamFileProposals, teamFiles, teamFileVersions } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { inspectTeamFileContent } from '../files/team-file-inspection.js'
import {
  claimTeamFileProposal,
  completeTeamFileProposal,
  failTeamFileProposal
} from '../files/team-file-proposal-invocation.js'
import { ApiProblem } from '../http/api-problem.js'
import {
  requireIdempotencyKey,
  runIdempotentMutation,
  type TeamRunTransaction
} from '../http/idempotent-mutation.js'
import { requireTeamServerAgent } from './team-agent-access.js'
import { requireTeamFile } from './team-file-access.js'
import { requireTeamServerBinding } from './team-server-routes.js'
import { sendTeamServerRuntimeRequest } from '../team-server/team-server-runtime-client.js'

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

const proposalFields = {
  id: teamFileProposals.id,
  organizationId: teamFileProposals.organizationId,
  projectId: teamFileProposals.projectId,
  teamFileId: teamFileProposals.teamFileId,
  baseVersion: teamFileProposals.baseVersion,
  teamAgentId: teamFileProposals.teamAgentId,
  requestedByUserId: teamFileProposals.requestedByUserId,
  instructionsMarkdown: teamFileProposals.instructionsMarkdown,
  proposedContentBase64: teamFileProposals.proposedContentBase64,
  status: teamFileProposals.status,
  errorCode: teamFileProposals.errorCode,
  appliedVersionId: teamFileProposals.appliedVersionId,
  createdAt: teamFileProposals.createdAt,
  updatedAt: teamFileProposals.updatedAt
}

export function registerTeamFileProposalRoutes(app: FastifyInstance): void {
  app.get('/v1/files/:teamFileId/proposals', async (request) => {
    const { teamFileId } = request.params as { teamFileId: string }
    await requireTeamFile(app, teamFileId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select(proposalFields)
      .from(teamFileProposals)
      .where(eq(teamFileProposals.teamFileId, teamFileId))
      .orderBy(desc(teamFileProposals.createdAt))
  })

  app.post('/v1/files/:teamFileId/proposals', async (request, reply) => {
    const { teamFileId } = request.params as { teamFileId: string }
    const body = createTeamFileProposalRequestSchema.parse(request.body)
    const file = await requireTeamFile(app, teamFileId, request.teamRunUser.id)
    requireEditableDocument(file)
    const agent = await requireTeamServerAgent(app, file.projectId, body.teamAgentId)
    const { pairing } = await requireTeamServerBinding(app, file.projectId)
    const status = await sendTeamServerRuntimeRequest<{ capabilities?: string[] }>(
      pairing,
      'status.get',
      undefined,
      15_000
    )
    if (!status.capabilities?.includes(TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY)) {
      throw new ApiProblem(
        409,
        'team_server_document_edit_update_required',
        'Update the Team Server before requesting document edits'
      )
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const claimed = await claimTeamFileProposal(app, {
      organizationId: file.organizationId,
      projectId: file.projectId,
      teamFileId,
      baseVersion: file.currentVersion,
      teamAgentId: agent.id,
      userId: request.teamRunUser.id,
      key,
      requestHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      instructionsMarkdown: body.instructionsMarkdown
    })
    if (!claimed.shouldRun) {
      return reply.code(200).send(publicProposal(claimed.proposal))
    }

    try {
      const [version] = await app.teamRunDatabase
        .select()
        .from(teamFileVersions)
        .where(
          and(
            eq(teamFileVersions.teamFileId, teamFileId),
            eq(teamFileVersions.version, file.currentVersion)
          )
        )
        .limit(1)
      if (!version || version.availability !== 'available') {
        throw new ApiProblem(423, 'team_file_quarantined', 'Document is not available')
      }
      const currentContentMarkdown = decodeMarkdown(version.contentBase64)
      const response = await sendTeamServerRuntimeRequest<{ proposedContentMarkdown: string }>(
        pairing,
        'teamrun.teamAgent.proposeDocumentEdit',
        {
          connectionId: agent.modelConnectionId,
          agent: { name: agent.name, instructionsMarkdown: agent.instructionsMarkdown },
          path: file.path,
          instructionsMarkdown: body.instructionsMarkdown,
          currentContentMarkdown
        },
        130_000
      )
      const proposedContentBase64 = encodeProposal(response.proposedContentMarkdown)
      const proposal = await completeTeamFileProposal(app, {
        proposalId: claimed.proposal.id,
        organizationId: file.organizationId,
        userId: request.teamRunUser.id,
        contentBase64: proposedContentBase64
      })
      return reply.code(201).send(publicProposal(proposal))
    } catch (error) {
      await failTeamFileProposal(app, {
        proposalId: claimed.proposal.id,
        organizationId: file.organizationId,
        userId: request.teamRunUser.id,
        error
      })
      throw error
    }
  })

  app.post('/v1/file-proposals/:proposalId/apply', async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string }
    const [proposal] = await app.teamRunDatabase
      .select()
      .from(teamFileProposals)
      .where(eq(teamFileProposals.id, proposalId))
      .limit(1)
    if (!proposal) {
      throw new ApiProblem(404, 'team_file_proposal_not_found', 'Proposal was not found')
    }
    await requireTeamFile(app, proposal.teamFileId, request.teamRunUser.id)
    if (proposal.requestedByUserId !== request.teamRunUser.id) {
      throw new ApiProblem(
        403,
        'team_file_proposal_apply_forbidden',
        'Only the requester can apply'
      )
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/file-proposals/${proposalId}/apply`,
      key,
      requestBody: {},
      execute: (transaction) => applyProposal(transaction, proposalId, request.teamRunUser.id)
    })
    return reply.code(result.status).send(result.body)
  })
}

async function applyProposal(transaction: TeamRunTransaction, proposalId: string, userId: string) {
  const [proposal] = await transaction
    .select()
    .from(teamFileProposals)
    .where(eq(teamFileProposals.id, proposalId))
    .for('update')
  if (!proposal || proposal.status !== 'ready' || !proposal.proposedContentBase64) {
    throw new ApiProblem(409, 'team_file_proposal_not_ready', 'Proposal is not ready to apply')
  }
  const [file] = await transaction
    .select()
    .from(teamFiles)
    .where(eq(teamFiles.id, proposal.teamFileId))
    .for('update')
  if (!file || file.deletedAt) {
    throw new ApiProblem(404, 'team_file_not_found', 'Team File was not found')
  }
  if (file.currentVersion !== proposal.baseVersion) {
    throw new ApiProblem(409, 'team_file_proposal_stale', 'Document changed after the proposal')
  }
  const inspected = inspectTeamFileContent(proposal.proposedContentBase64)
  const nextVersion = file.currentVersion + 1
  const [version] = await transaction
    .insert(teamFileVersions)
    .values({
      organizationId: file.organizationId,
      projectId: file.projectId,
      teamFileId: file.id,
      version: nextVersion,
      mimeType: file.currentMimeType,
      sizeBytes: inspected.bytes.byteLength,
      sha256: inspected.sha256,
      contentBase64: proposal.proposedContentBase64,
      availability: inspected.availability,
      quarantineReason: inspected.quarantineReason,
      createdByUserId: userId
    })
    .returning(versionFields)
  if (!version) {
    throw new ApiProblem(500, 'team_file_proposal_apply_failed', 'Version was not created')
  }
  await transaction
    .update(teamFiles)
    .set({ currentVersion: nextVersion, updatedAt: new Date() })
    .where(eq(teamFiles.id, file.id))
  await transaction
    .update(teamFileProposals)
    .set({ status: 'applied', appliedVersionId: version.id, updatedAt: new Date() })
    .where(eq(teamFileProposals.id, proposal.id))
  await appendTeamEvent(transaction, {
    organizationId: file.organizationId,
    type: 'team_file.version_created',
    entityId: version.id,
    actorUserId: userId,
    data: { teamFileId: file.id, projectId: file.projectId, version: nextVersion }
  })
  await appendTeamEvent(transaction, {
    organizationId: file.organizationId,
    type: 'team_file.proposal_applied',
    entityId: proposal.id,
    actorUserId: userId,
    data: { teamFileId: file.id, teamAgentId: proposal.teamAgentId, version: nextVersion }
  })
  return { status: 201, body: version }
}

function requireEditableDocument(file: Awaited<ReturnType<typeof requireTeamFile>>): void {
  if (file.kind !== 'document' || file.currentMimeType !== 'text/markdown') {
    throw new ApiProblem(409, 'team_document_required', 'Agent edits require a Markdown document')
  }
}

function decodeMarkdown(contentBase64: string): string {
  const bytes = Buffer.from(contentBase64, 'base64')
  if (bytes.byteLength > 48_000) {
    throw new ApiProblem(413, 'team_document_agent_input_too_large', 'Document is too large')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ApiProblem(400, 'team_document_utf8_required', 'Document must be valid UTF-8')
  }
}

function encodeProposal(content: string): string {
  const trimmed = content.trim()
  if (!trimmed || Buffer.byteLength(trimmed, 'utf8') > 64_000) {
    throw new ApiProblem(502, 'team_file_proposal_invalid', 'Agent returned an invalid proposal')
  }
  return Buffer.from(trimmed, 'utf8').toString('base64')
}

function publicProposal(proposal: typeof teamFileProposals.$inferSelect) {
  return Object.fromEntries(
    Object.keys(proposalFields).map((key) => [key, proposal[key as keyof typeof proposal]])
  )
}
