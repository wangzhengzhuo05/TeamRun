import { describe, expect, it, vi } from 'vitest'
import type { ChannelMessage } from '../../shared/teamrun-api'
import { TeamAgentChatService } from './team-agent-chat-service'
import type { TeamRunApiClient } from './teamrun-api-client'

describe('TeamAgentChatService', () => {
  it('delegates replies to the central Team Server endpoint', async () => {
    const channelId = crypto.randomUUID()
    const teamAgentId = crypto.randomUUID()
    const reply = { id: crypto.randomUUID(), authorTeamAgentId: teamAgentId } as ChannelMessage
    const request = vi.fn().mockResolvedValue(reply)
    const service = new TeamAgentChatService({ request } as unknown as TeamRunApiClient)

    await expect(
      service.reply({
        projectId: crypto.randomUUID(),
        channelId,
        teamAgentId,
        bodyMarkdown: '@Release assistant help.'
      })
    ).resolves.toBe(reply)

    expect(request).toHaveBeenCalledWith(`/v1/channels/${channelId}/team-agent-replies`, {
      method: 'POST',
      body: { teamAgentId },
      queueIfOffline: false,
      timeoutMs: 135_000
    })
  })
})
