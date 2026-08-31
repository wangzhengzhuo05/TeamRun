// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamAgent } from '../../../../shared/teamrun-api'
import { TeamAgentManagement } from './TeamAgentManagement'

const collaboration = vi.hoisted(() => ({
  credentialStatus: vi.fn(),
  listTeamAgents: vi.fn()
}))

const claudeAgent: TeamAgent = {
  id: 'agent-claude',
  projectId: 'project-1',
  name: 'Claude',
  agentKind: 'claude',
  launchCommand: null,
  instructionsMarkdown: '',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z'
}

describe('TeamAgentManagement', () => {
  beforeEach(() => {
    collaboration.listTeamAgents.mockResolvedValue([claudeAgent])
    collaboration.credentialStatus.mockResolvedValue({
      configured: true,
      baseUrl: 'https://claude.example.test'
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { teamRun: { collaboration } } as never
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('uses the Claude Code label for an existing default Claude agent', async () => {
    render(<TeamAgentManagement projectId="project-1" active />)

    await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
    expect(screen.queryByText('Claude')).not.toBeInTheDocument()
    expect(screen.queryByText('claude')).not.toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Base URL (optional)')).toHaveLength(2)
    expect(screen.getByDisplayValue('https://claude.example.test')).toBeInTheDocument()
  })
})
