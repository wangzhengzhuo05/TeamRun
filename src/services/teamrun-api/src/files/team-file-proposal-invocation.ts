import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { teamFileProposals } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'

const RUNNING_RETRY_MS = 3 * 60 * 1000

type ClaimArgs = {
  organizationId: string
  projectId: string
  teamFileId: string
  baseVersion: number
  teamAgentId: string
  userId: string
  key: string
  requestHash: string
  instructionsMarkdown: string
}

export async function claimTeamFileProposal(app: FastifyInstance, args: ClaimArgs) {
  return app.teamRunDatabase.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${args.userId}:${args.teamFileId}:${args.key}`}))`
    )
    const [existing] = await transaction
      .select()
      .from(teamFileProposals)
      .where(
        and(
          eq(teamFileProposals.requestedByUserId, args.userId),
          eq(teamFileProposals.teamFileId, args.teamFileId),
          eq(teamFileProposals.idempotencyKey, args.key)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestHash !== args.requestHash) {
        throw new ApiProblem(409, 'idempotency_conflict', 'Idempotency key has different input')
      }
      if (existing.status === 'ready' || existing.status === 'applied') {
        return { proposal: existing, shouldRun: false }
      }
      if (
        existing.status === 'running' &&
        Date.now() - existing.updatedAt.getTime() < RUNNING_RETRY_MS
      ) {
        throw new ApiProblem(
          409,
          'team_file_proposal_in_progress',
          'Document proposal is in progress'
        )
      }
      const [retried] = await transaction
        .update(teamFileProposals)
        .set({
          status: 'running',
          proposedContentBase64: null,
          errorCode: null,
          updatedAt: new Date()
        })
        .where(eq(teamFileProposals.id, existing.id))
        .returning()
      if (!retried) {
        throw new ApiProblem(404, 'team_file_proposal_not_found', 'Proposal was not found')
      }
      await appendRequestedEvent(transaction, existing.id, args)
      return { proposal: retried, shouldRun: true }
    }
    const [created] = await transaction
      .insert(teamFileProposals)
      .values({
        organizationId: args.organizationId,
        projectId: args.projectId,
        teamFileId: args.teamFileId,
        baseVersion: args.baseVersion,
        teamAgentId: args.teamAgentId,
        requestedByUserId: args.userId,
        idempotencyKey: args.key,
        requestHash: args.requestHash,
        instructionsMarkdown: args.instructionsMarkdown
      })
      .returning()
    if (!created) {
      throw new ApiProblem(500, 'team_file_proposal_start_failed', 'Proposal was not started')
    }
    await appendRequestedEvent(transaction, created.id, args)
    return { proposal: created, shouldRun: true }
  })
}

export async function completeTeamFileProposal(
  app: FastifyInstance,
  args: { proposalId: string; organizationId: string; userId: string; contentBase64: string }
) {
  return app.teamRunDatabase.transaction(async (transaction) => {
    const [proposal] = await transaction
      .update(teamFileProposals)
      .set({
        status: 'ready',
        proposedContentBase64: args.contentBase64,
        errorCode: null,
        updatedAt: new Date()
      })
      .where(eq(teamFileProposals.id, args.proposalId))
      .returning()
    if (!proposal) {
      throw new ApiProblem(404, 'team_file_proposal_not_found', 'Proposal was not found')
    }
    await appendTeamEvent(transaction, {
      organizationId: args.organizationId,
      type: 'team_file.proposal_ready',
      entityId: proposal.id,
      actorUserId: args.userId,
      data: { teamFileId: proposal.teamFileId, teamAgentId: proposal.teamAgentId }
    })
    return proposal
  })
}

export async function failTeamFileProposal(
  app: FastifyInstance,
  args: { proposalId: string; organizationId: string; userId: string; error: unknown }
): Promise<void> {
  const errorCode = args.error instanceof ApiProblem ? args.error.code : 'team_file_proposal_failed'
  await app.teamRunDatabase.transaction(async (transaction) => {
    await transaction
      .update(teamFileProposals)
      .set({ status: 'failed', errorCode, updatedAt: new Date() })
      .where(eq(teamFileProposals.id, args.proposalId))
    await appendTeamEvent(transaction, {
      organizationId: args.organizationId,
      type: 'team_file.proposal_failed',
      entityId: args.proposalId,
      actorUserId: args.userId,
      data: { errorCode }
    })
  })
}

async function appendRequestedEvent(
  transaction: Parameters<typeof appendTeamEvent>[0],
  proposalId: string,
  args: ClaimArgs
): Promise<void> {
  await appendTeamEvent(transaction, {
    organizationId: args.organizationId,
    type: 'team_file.proposal_requested',
    entityId: proposalId,
    actorUserId: args.userId,
    data: { teamFileId: args.teamFileId, teamAgentId: args.teamAgentId }
  })
}
