import type { ChannelMessage } from '../../shared/teamrun-api'
import type { TeamRunApiClient } from './teamrun-api-client'

export class TeamAgentChatService {
  constructor(private readonly client: TeamRunApiClient) {}

  reply(args: {
    projectId: string
    channelId: string
    teamAgentId: string
    bodyMarkdown: string
  }): Promise<ChannelMessage> {
    return this.client.request<ChannelMessage>(
      `/v1/channels/${args.channelId}/team-agent-replies`,
      {
        method: 'POST',
        body: { teamAgentId: args.teamAgentId },
        queueIfOffline: false,
        timeoutMs: 135_000
      }
    )
  }
}
