import { describe, expect, it, vi } from 'vitest'
import type { ChannelMessage, TeamAgent } from '../../shared/teamrun-api'
import { TeamAgentChatService } from './team-agent-chat-service'
import type { TeamRunApiClient } from './teamrun-api-client'

const projectId = crypto.randomUUID()
const channelId = crypto.randomUUID()
const teamAgentId = crypto.randomUUID()

function teamAgent(agentKind = 'codex'): TeamAgent {
  return {
    id: teamAgentId,
    organizationId: crypto.randomUUID(),
    projectId,
    name: 'Release assistant',
    agentKind,
    launchCommand: null,
    instructionsMarkdown: 'Keep answers concise.',
    version: 1,
    createdByUserId: crypto.randomUUID(),
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z'
  }
}

function channelMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    channelId,
    authorUserId: crypto.randomUUID(),
    authorTeamAgentId: null,
    bodyMarkdown: 'Can you review the release notes?',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

describe('TeamAgentChatService', () => {
  it('uses recent channel context and records the reply as the mentioned Agent', async () => {
    const agent = teamAgent()
    const request = vi
      .fn()
      .mockResolvedValueOnce([agent])
      .mockResolvedValueOnce([channelMessage()])
      .mockResolvedValueOnce(
        channelMessage({ authorTeamAgentId: agent.id, bodyMarkdown: 'Ready.' })
      )
    const executeReply = vi.fn(async () => 'Ready.')
    const service = new TeamAgentChatService({ request } as unknown as TeamRunApiClient, {
      readCredential: () => 'sk-local-test-key',
      executeReply
    })

    const reply = await service.reply({
      projectId,
      channelId,
      teamAgentId,
      bodyMarkdown: '@Release assistant please review the release notes.'
    })

    expect(executeReply).toHaveBeenCalledWith(agent, [expect.any(Object)], 'sk-local-test-key')
    expect(request).toHaveBeenNthCalledWith(1, `/v1/projects/${projectId}/team-agents`, {
      cache: false
    })
    expect(request).toHaveBeenNthCalledWith(2, `/v1/channels/${channelId}/messages`, {
      cache: false
    })
    expect(request).toHaveBeenLastCalledWith(`/v1/channels/${channelId}/agent-messages`, {
      method: 'POST',
      body: { authorTeamAgentId: teamAgentId, bodyMarkdown: 'Ready.' },
      queueIfOffline: false
    })
    expect(reply.authorTeamAgentId).toBe(teamAgentId)
  })

  it('does not invoke Codex or create a message when the local API key is missing', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([teamAgent()])
      .mockResolvedValueOnce([channelMessage()])
    const executeReply = vi.fn()
    const service = new TeamAgentChatService({ request } as unknown as TeamRunApiClient, {
      readCredential: () => null,
      executeReply
    })

    await expect(
      service.reply({ projectId, channelId, teamAgentId, bodyMarkdown: '@Release assistant help.' })
    ).rejects.toThrow('team_agent_api_key_missing')

    expect(executeReply).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(2)
  })
})
