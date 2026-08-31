// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationMember } from '../../../../shared/teamrun-api'
import { TeamMemberManagement } from './TeamMemberManagement'

const organizations = vi.hoisted(() => ({
  createInviteCode: vi.fn(),
  listInviteCodes: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
  revokeInviteCode: vi.fn(),
  updateMemberRole: vi.fn()
}))
const writeText = vi.hoisted(() => vi.fn())

const members: OrganizationMember[] = [
  {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'owner@example.test',
    displayName: 'Team Owner',
    role: 'owner',
    joinedAt: '2026-08-31T00:00:00.000Z'
  },
  {
    userId: '00000000-0000-4000-8000-000000000002',
    email: 'member@example.test',
    displayName: 'Team Member',
    role: 'member',
    joinedAt: '2026-08-31T00:00:00.000Z'
  }
]

describe('TeamMemberManagement', () => {
  beforeEach(() => {
    organizations.listMembers.mockResolvedValue(members)
    organizations.listInviteCodes.mockResolvedValue([])
    organizations.createInviteCode.mockResolvedValue({
      code: 'TR-1111-2222-3333-4444-5555-6666-7777-8888'
    })
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText: writeText }, teamRun: { organizations } } as never
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lets the Owner generate and copy a one-time invite code', async () => {
    render(<TeamMemberManagement organizationId="organization-1" canManage active />)

    fireEvent.click(await screen.findByRole('button', { name: 'Create code' }))
    const code = await screen.findByLabelText('Invite code')
    expect(code).toHaveValue('TR-1111-2222-3333-4444-5555-6666-7777-8888')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('TR-1111-2222-3333-4444-5555-6666-7777-8888')
    )
  })

  it('keeps membership read-only for non-Owners', async () => {
    render(<TeamMemberManagement organizationId="organization-1" canManage={false} active />)

    await screen.findByText('Team Member')
    expect(screen.queryByRole('button', { name: 'Create code' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Team Member' })).not.toBeInTheDocument()
    expect(organizations.listInviteCodes).not.toHaveBeenCalled()
  })
})
