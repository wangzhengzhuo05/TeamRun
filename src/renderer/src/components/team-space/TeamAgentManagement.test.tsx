// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamAgent } from '../../../../shared/teamrun-api'
import { TeamAgentManagement } from './TeamAgentManagement'

const collaboration = vi.hoisted(() => ({
  getTeamServer: vi.fn(),
  listModelConnections: vi.fn(),
  listTeamAgents: vi.fn()
}))

const legacyAgent: TeamAgent = {
  id: 'agent-claude',
  organizationId: 'organization-1',
  projectId: 'project-1',
  name: 'Documentation assistant',
  agentKind: 'claude',
  launchCommand: null,
  instructionsMarkdown: '',
  version: 1,
  createdByUserId: 'user-1',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z'
}

describe('TeamAgentManagement', () => {
  beforeEach(() => {
    collaboration.getTeamServer.mockResolvedValue(null)
    collaboration.listModelConnections.mockResolvedValue([])
    collaboration.listTeamAgents.mockResolvedValue([legacyAgent])
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { teamRun: { collaboration } } as never
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows central Team Server setup and marks legacy Agents for migration', async () => {
    render(<TeamAgentManagement projectId="project-1" active canManage />)

    await waitFor(() => expect(screen.getByText('Documentation assistant')).toBeInTheDocument())
    expect(screen.getByText('Team Server')).toBeInTheDocument()
    expect(screen.getByText('Migration required')).toBeInTheDocument()
    expect(screen.getByLabelText('One-time pairing code')).toBeInTheDocument()
    expect(screen.queryByText('Local API key configured')).not.toBeInTheDocument()
  })
})
