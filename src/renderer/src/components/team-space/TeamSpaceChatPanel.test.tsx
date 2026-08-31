// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  Channel,
  ChannelMessage,
  OrganizationMember,
  TeamAgent
} from '../../../../shared/teamrun-api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TeamSpaceChatPanel } from './TeamSpaceChatPanel'

const createdAt = '2026-08-31T08:00:00.000Z'
const channel: Channel = {
  id: 'channel-1',
  organizationId: 'organization-1',
  projectId: 'project-1',
  name: 'general',
  description: '',
  createdByUserId: 'user-1',
  createdAt,
  updatedAt: createdAt
}
const members: OrganizationMember[] = [
  {
    userId: 'user-1',
    email: 'self@example.com',
    displayName: 'Self',
    role: 'owner',
    joinedAt: createdAt
  },
  {
    userId: 'user-2',
    email: 'other@example.com',
    displayName: 'Other',
    role: 'member',
    joinedAt: createdAt
  }
]
const agent: TeamAgent = {
  id: 'agent-1',
  organizationId: 'organization-1',
  projectId: 'project-1',
  name: 'Reviewer',
  agentKind: 'codex',
  launchCommand: null,
  instructionsMarkdown: '',
  version: 1,
  createdByUserId: 'user-1',
  createdAt,
  updatedAt: createdAt
}

function message(
  id: string,
  bodyMarkdown: string,
  authorUserId: string,
  authorTeamAgentId: string | null = null
): ChannelMessage {
  return {
    id,
    organizationId: 'organization-1',
    channelId: channel.id,
    authorUserId,
    authorTeamAgentId,
    bodyMarkdown,
    createdAt,
    updatedAt: createdAt
  }
}

describe('TeamSpaceChatPanel message layout', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(cleanup)

  it('aligns only the immutable current user identity to the right', () => {
    render(
      <TooltipProvider>
        <TeamSpaceChatPanel
          projectId="project-1"
          authUserId="user-1"
          channels={[channel]}
          channelId={channel.id}
          messages={[
            message('message-1', 'Own message', 'user-1'),
            message('message-2', 'Other message', 'user-2'),
            message('message-3', 'Agent message', 'user-1', agent.id),
            message('message-4', 'Deleted agent message', 'user-1', 'deleted-agent')
          ]}
          members={members}
          teamAgents={[agent]}
          loading={false}
          sending={false}
          replyingAgentIds={[]}
          onSelectChannel={vi.fn()}
          onCreateGeneralChannel={vi.fn(async () => {})}
          onSendMessage={vi.fn(async () => true)}
        />
      </TooltipProvider>
    )

    expect(screen.getByText('Own message').closest('article')).toHaveAttribute(
      'data-message-side',
      'outgoing'
    )
    for (const text of ['Other message', 'Agent message', 'Deleted agent message']) {
      expect(screen.getByText(text).closest('article')).toHaveAttribute(
        'data-message-side',
        'incoming'
      )
    }
    expect(screen.getByText('Team Agent')).toBeInTheDocument()
  })
})
