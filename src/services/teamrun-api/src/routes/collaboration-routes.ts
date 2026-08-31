import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  createAgentChannelMessageRequestSchema,
  createChannelMessageRequestSchema,
  createChannelRequestSchema,
  createTeamAgentRequestSchema
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { channelMessages, channels, teamAgents } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import { requireProject } from './project-access.js'

async function requireChannel(app: FastifyInstance, channelId: string, userId: string) {
  const [channel] = await app.teamRunDatabase
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  if (!channel) {
    throw new ApiProblem(404, 'channel_not_found', 'Channel was not found')
  }
  await requireOrganizationRole(app.teamRunDatabase, channel.organizationId, userId)
  return channel
}

export async function registerCollaborationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects/:projectId/channels', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(channels)
      .where(eq(channels.projectId, projectId))
      .orderBy(channels.name)
  })

  app.post('/v1/projects/:projectId/channels', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createChannelRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/channels`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [channel] = await transaction
          .insert(channels)
          .values({
            organizationId: project.organizationId,
            projectId,
            createdByUserId: request.teamRunUser.id,
            ...body
          })
          .returning()
        if (!channel) {
          throw new ApiProblem(500, 'channel_create_failed', 'Channel was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: 'channel.created',
          entityId: channel.id,
          actorUserId: request.teamRunUser.id
        })
        return { status: 201, body: channel }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/channels/:channelId/messages', async (request) => {
    const { channelId } = request.params as { channelId: string }
    await requireChannel(app, channelId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(channelMessages)
      .where(eq(channelMessages.channelId, channelId))
      .orderBy(asc(channelMessages.createdAt))
  })

  app.post('/v1/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params as { channelId: string }
    const body = createChannelMessageRequestSchema.parse(request.body)
    const channel = await requireChannel(app, channelId, request.teamRunUser.id)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/channels/${channelId}/messages`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [message] = await transaction
          .insert(channelMessages)
          .values({
            organizationId: channel.organizationId,
            channelId,
            authorUserId: request.teamRunUser.id,
            ...body
          })
          .returning()
        if (!message) {
          throw new ApiProblem(500, 'message_create_failed', 'Message was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: channel.organizationId,
          type: 'channel.message_created',
          entityId: message.id,
          actorUserId: request.teamRunUser.id,
          data: { channelId }
        })
        return { status: 201, body: message }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.post('/v1/channels/:channelId/agent-messages', async (request, reply) => {
    const { channelId } = request.params as { channelId: string }
    const body = createAgentChannelMessageRequestSchema.parse(request.body)
    const channel = await requireChannel(app, channelId, request.teamRunUser.id)
    const [teamAgent] = await app.teamRunDatabase
      .select({ id: teamAgents.id })
      .from(teamAgents)
      .where(
        and(eq(teamAgents.id, body.authorTeamAgentId), eq(teamAgents.projectId, channel.projectId))
      )
      .limit(1)
    if (!teamAgent) {
      throw new ApiProblem(
        400,
        'team_agent_channel_mismatch',
        'Team Agent is not in this channel project'
      )
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/channels/${channelId}/agent-messages`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [message] = await transaction
          .insert(channelMessages)
          .values({
            organizationId: channel.organizationId,
            channelId,
            authorUserId: request.teamRunUser.id,
            ...body
          })
          .returning()
        if (!message) {
          throw new ApiProblem(500, 'agent_message_create_failed', 'Agent message was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: channel.organizationId,
          type: 'channel.message_created',
          entityId: message.id,
          actorUserId: request.teamRunUser.id,
          data: { channelId, teamAgentId: teamAgent.id }
        })
        return { status: 201, body: message }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/projects/:projectId/team-agents', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(teamAgents)
      .where(eq(teamAgents.projectId, projectId))
      .orderBy(teamAgents.name)
  })

  app.post('/v1/projects/:projectId/team-agents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = createTeamAgentRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id,
      ['owner']
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/team-agents`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [teamAgent] = await transaction
          .insert(teamAgents)
          .values({
            organizationId: project.organizationId,
            projectId,
            createdByUserId: request.teamRunUser.id,
            ...body
          })
          .returning()
        if (!teamAgent) {
          throw new ApiProblem(500, 'team_agent_create_failed', 'Team Agent was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: 'team_agent.created',
          entityId: teamAgent.id,
          actorUserId: request.teamRunUser.id
        })
        return { status: 201, body: teamAgent }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}
