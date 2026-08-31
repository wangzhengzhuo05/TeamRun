import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { teamRunErrorMessage } from './teamrun-error-message'

describe('teamRunErrorMessage', () => {
  it('maps first-party error codes to stable UI copy', () => {
    expect(
      teamRunErrorMessage(
        Object.assign(new Error('Team key is invalid'), { code: 'invalid_shared_key' }),
        'Unable to connect'
      )
    ).toBe('TeamRun could not verify these credentials.')
  })

  it('does not expose an unknown server message', () => {
    expect(teamRunErrorMessage(new Error('Internal database detail'), 'Unable to load chat')).toBe(
      'Unable to load chat'
    )
  })

  it('uses actionable invite-code copy', () => {
    expect(
      teamRunErrorMessage(
        Object.assign(new Error('Invite code is redeemed'), { code: 'invite_code_redeemed' }),
        'Unable to join Team'
      )
    ).toBe('This invite code has already been used.')
  })
})
