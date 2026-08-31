import { z } from 'zod'
import {
  createChannelMessageRequestSchema,
  createChannelRequestSchema,
  createModelConnectionRequestSchema,
  enrollTeamServerRequestSchema,
  createTeamAgentRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { TeamRunCloudOperation } from '../../shared/teamrun-cloud-operations'
import type { TeamAgentChatService } from './team-agent-chat-service'
import type { TeamRunApiClient } from './teamrun-api-client'

const idSchema = z.uuid()

type CollaborationOperation = Extract<TeamRunCloudOperation, `collaboration.${string}`>

export async function invokeTeamRunCollaborationOperation(
  client: TeamRunApiClient,
  agentChat: TeamAgentChatService,
  operation: CollaborationOperation,
  args: unknown
): Promise<unknown> {
  switch (operation) {
    case 'collaboration.listChannels':
      return client.request(`/v1/projects/${idSchema.parse(args)}/channels`)
    case 'collaboration.createChannel': {
      const parsed = z
        .object({ projectId: idSchema, channel: createChannelRequestSchema })
        .parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/channels`, {
        method: 'POST',
        body: parsed.channel
      })
    }
    case 'collaboration.listMessages':
      return client.request(`/v1/channels/${idSchema.parse(args)}/messages`)
    case 'collaboration.createMessage': {
      const parsed = z
        .object({ channelId: idSchema, message: createChannelMessageRequestSchema })
        .parse(args)
      return client.request(`/v1/channels/${parsed.channelId}/messages`, {
        method: 'POST',
        body: parsed.message
      })
    }
    case 'collaboration.listTeamAgents':
      return client.request(`/v1/projects/${idSchema.parse(args)}/team-agents`)
    case 'collaboration.createTeamAgent': {
      const parsed = z
        .object({ projectId: idSchema, teamAgent: createTeamAgentRequestSchema })
        .parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/team-agents`, {
        method: 'POST',
        body: parsed.teamAgent
      })
    }
    case 'collaboration.getTeamServer':
      return client.request(`/v1/projects/${idSchema.parse(args)}/team-server`)
    case 'collaboration.enrollTeamServer': {
      const parsed = z
        .object({ projectId: idSchema, teamServer: enrollTeamServerRequestSchema })
        .parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/team-server`, {
        method: 'POST',
        body: parsed.teamServer,
        queueIfOffline: false
      })
    }
    case 'collaboration.listModelConnections':
      return client.request(`/v1/projects/${idSchema.parse(args)}/model-connections`)
    case 'collaboration.createModelConnection': {
      const parsed = z
        .object({ projectId: idSchema, connection: createModelConnectionRequestSchema })
        .parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/model-connections`, {
        method: 'POST',
        body: parsed.connection,
        queueIfOffline: false
      })
    }
    case 'collaboration.credentialStatus': {
      idSchema.parse(args)
      throw new Error('team_agent_local_credentials_removed')
    }
    case 'collaboration.saveCredential': {
      z.object({
        agentId: idSchema,
        apiKey: z.string().max(1024),
        baseUrl: z.string().max(2048).nullable().optional()
      }).parse(args)
      throw new Error('team_agent_local_credentials_removed')
    }
    case 'collaboration.reply': {
      const parsed = z
        .object({
          projectId: idSchema,
          channelId: idSchema,
          teamAgentId: idSchema,
          bodyMarkdown: z.string().trim().min(1).max(32_000)
        })
        .parse(args)
      return agentChat.reply(parsed)
    }
  }
}
