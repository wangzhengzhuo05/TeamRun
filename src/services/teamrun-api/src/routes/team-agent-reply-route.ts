import { createHash } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requestTeamAgentReplySchema } from '@teamrun/contracts'
import {
  channelMessages,
  modelConnections,
  teamAgentReplyInvocations,
  teamAgents
} from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey } from '../http/idempotent-mutation.js'
import { sendTeamServerRuntimeRequest } from '../team-server/team-server-runtime-client.js'
import { requireChannel } from './collaboration-routes.js'
import { requireTeamServerBinding } from './team-server-routes.js'

const RUNNING_RETRY_MS = 3 * 60 * 1000

export async function registerTeamAgentReplyRoute(app: FastifyInstance): Promise<void> {
  app.post('/v1/channels/:channelId/team-agent-replies', async (request, reply) => {
    const { channelId } = request.params as { channelId: string }
    const body = requestTeamAgentReplySchema.parse(request.body)
    const channel = await requireChannel(app, channelId, request.teamRunUser.id)
    const agent = await requireChatAgent(app, channel.projectId, body.teamAgentId)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const claimed = await claimInvocation(app, {
      organizationId: channel.organizationId,
      channelId,
      teamAgentId: agent.id,
      userId: request.teamRunUser.id,
      key,
      requestHash: createHash('sha256').update(JSON.stringify(body)).digest('hex')
    })
    if (claimed.message) {
      return reply.code(200).send(claimed.message)
    }

    try {
      const [{ pairing }, messages] = await Promise.all([
        requireTeamServerBinding(app, channel.projectId),
        app.teamRunDatabase
          .select()
          .from(channelMessages)
          .where(eq(channelMessages.channelId, channelId))
          .orderBy(asc(channelMessages.createdAt))
      ])
      const response = await sendTeamServerRuntimeRequest<{ bodyMarkdown: string }>(
        pairing,
        'teamrun.teamAgent.reply',
        {
          connectionId: agent.modelConnectionId,
          agent: { name: agent.name, instructionsMarkdown: agent.instructionsMarkdown },
          messages: messages.slice(-20).map((message) => ({
            author: message.authorTeamAgentId ? 'Team Agent' : 'Team member',
            bodyMarkdown: message.bodyMarkdown.slice(0, 32_000)
          }))
        },
        130_000
      )
      if (!response.bodyMarkdown.trim() || response.bodyMarkdown.length > 16_000) {
        throw new ApiProblem(
          502,
          'team_agent_reply_invalid',
          'Team Agent returned an invalid reply'
        )
      }
      const message = await completeInvocation(app, {
        invocationId: claimed.invocationId,
        organizationId: channel.organizationId,
        channelId,
        teamAgentId: agent.id,
        userId: request.teamRunUser.id,
        bodyMarkdown: response.bodyMarkdown.trim()
      })
      return reply.code(201).send(message)
    } catch (error) {
      await failInvocation(
        app,
        claimed.invocationId,
        channel.organizationId,
        request.teamRunUser.id,
        error
      )
      throw error
    }
  })
}

async function requireChatAgent(app: FastifyInstance, projectId: string, agentId: string) {
  const [agent] = await app.teamRunDatabase
    .select()
    .from(teamAgents)
    .where(and(eq(teamAgents.id, agentId), eq(teamAgents.projectId, projectId)))
    .limit(1)
  if (!agent) {
    throw new ApiProblem(404, 'team_agent_not_found', 'Team Agent was not found')
  }
  if (agent.agentKind !== 'opencode' || !agent.modelConnectionId) {
    throw new ApiProblem(
      409,
      'team_agent_server_migration_required',
      'Recreate this Team Agent with a Team Server Model Connection'
    )
  }
  const [connection] = await app.teamRunDatabase
    .select({ id: modelConnections.id, keyConfigured: modelConnections.keyConfigured })
    .from(modelConnections)
    .where(
      and(
        eq(modelConnections.id, agent.modelConnectionId),
        eq(modelConnections.projectId, projectId)
      )
    )
    .limit(1)
  if (!connection?.keyConfigured) {
    throw new ApiProblem(
      409,
      'team_agent_model_connection_required',
      'Team Agent Model Connection is not configured'
    )
  }
  return agent as typeof agent & { modelConnectionId: string }
}

async function claimInvocation(
  app: FastifyInstance,
  args: {
    organizationId: string
    channelId: string
    teamAgentId: string
    userId: string
    key: string
    requestHash: string
  }
): Promise<{ invocationId: string; message?: typeof channelMessages.$inferSelect }> {
  return app.teamRunDatabase.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${args.userId}:${args.channelId}:${args.key}`}))`
    )
    const [existing] = await transaction
      .select()
      .from(teamAgentReplyInvocations)
      .where(
        and(
          eq(teamAgentReplyInvocations.requestedByUserId, args.userId),
          eq(teamAgentReplyInvocations.channelId, args.channelId),
          eq(teamAgentReplyInvocations.idempotencyKey, args.key)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestHash !== args.requestHash) {
        throw new ApiProblem(409, 'idempotency_conflict', 'Idempotency key has different input')
      }
      if (existing.status === 'completed' && existing.resultMessageId) {
        const [message] = await transaction
          .select()
          .from(channelMessages)
          .where(eq(channelMessages.id, existing.resultMessageId))
          .limit(1)
        if (message) {
          return { invocationId: existing.id, message }
        }
      }
      if (
        existing.status === 'running' &&
        Date.now() - existing.updatedAt.getTime() < RUNNING_RETRY_MS
      ) {
        throw new ApiProblem(409, 'team_agent_reply_in_progress', 'Team Agent reply is in progress')
      }
      await transaction
        .update(teamAgentReplyInvocations)
        .set({ status: 'running', errorCode: null, updatedAt: new Date() })
        .where(eq(teamAgentReplyInvocations.id, existing.id))
      await appendStartedEvent(transaction, existing.id, args)
      return { invocationId: existing.id }
    }
    const [created] = await transaction
      .insert(teamAgentReplyInvocations)
      .values({
        organizationId: args.organizationId,
        channelId: args.channelId,
        teamAgentId: args.teamAgentId,
        requestedByUserId: args.userId,
        idempotencyKey: args.key,
        requestHash: args.requestHash,
        status: 'running'
      })
      .returning({ id: teamAgentReplyInvocations.id })
    if (!created) {
      throw new ApiProblem(500, 'team_agent_reply_start_failed', 'Reply was not started')
    }
    await appendStartedEvent(transaction, created.id, args)
    return { invocationId: created.id }
  })
}

async function completeInvocation(
  app: FastifyInstance,
  args: {
    invocationId: string
    organizationId: string
    channelId: string
    teamAgentId: string
    userId: string
    bodyMarkdown: string
  }
) {
  return app.teamRunDatabase.transaction(async (transaction) => {
    const [message] = await transaction
      .insert(channelMessages)
      .values({
        organizationId: args.organizationId,
        channelId: args.channelId,
        authorUserId: args.userId,
        authorTeamAgentId: args.teamAgentId,
        bodyMarkdown: args.bodyMarkdown
      })
      .returning()
    if (!message) {
      throw new ApiProblem(500, 'team_agent_reply_save_failed', 'Reply was not saved')
    }
    await transaction
      .update(teamAgentReplyInvocations)
      .set({ status: 'completed', resultMessageId: message.id, updatedAt: new Date() })
      .where(eq(teamAgentReplyInvocations.id, args.invocationId))
    await appendTeamEvent(transaction, {
      organizationId: args.organizationId,
      type: 'channel.message_created',
      entityId: message.id,
      actorUserId: args.userId,
      data: { channelId: args.channelId, teamAgentId: args.teamAgentId }
    })
    await appendTeamEvent(transaction, {
      organizationId: args.organizationId,
      type: 'team_agent.reply_completed',
      entityId: args.invocationId,
      actorUserId: args.userId,
      data: { channelId: args.channelId, teamAgentId: args.teamAgentId, messageId: message.id }
    })
    return message
  })
}

async function failInvocation(
  app: FastifyInstance,
  invocationId: string,
  organizationId: string,
  userId: string,
  error: unknown
): Promise<void> {
  const errorCode = error instanceof ApiProblem ? error.code : 'team_agent_reply_failed'
  await app.teamRunDatabase.transaction(async (transaction) => {
    await transaction
      .update(teamAgentReplyInvocations)
      .set({ status: 'failed', errorCode, updatedAt: new Date() })
      .where(eq(teamAgentReplyInvocations.id, invocationId))
    await appendTeamEvent(transaction, {
      organizationId,
      type: 'team_agent.reply_failed',
      entityId: invocationId,
      actorUserId: userId,
      data: { errorCode }
    })
  })
}

async function appendStartedEvent(
  transaction: Parameters<typeof appendTeamEvent>[0],
  invocationId: string,
  args: { organizationId: string; channelId: string; teamAgentId: string; userId: string }
): Promise<void> {
  await appendTeamEvent(transaction, {
    organizationId: args.organizationId,
    type: 'team_agent.reply_started',
    entityId: invocationId,
    actorUserId: args.userId,
    data: { channelId: args.channelId, teamAgentId: args.teamAgentId }
  })
}
