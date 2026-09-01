import { describe, expect, it } from 'vitest'
import {
  createTeamInviteCode,
  hashTeamInviteCode,
  normalizeTeamInviteCode,
  teamInviteCodeStatus
} from './team-invite-code.js'

describe('Team invite codes', () => {
  it('creates a copyable code while retaining only a stable hash and hint', () => {
    const created = createTeamInviteCode()
    const normalized = normalizeTeamInviteCode(created.code)

    expect(created.code).toMatch(/^TR-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/)
    expect(normalized).not.toBeNull()
    expect(hashTeamInviteCode(normalized as string)).toBe(created.codeHash)
    expect(created.code.endsWith(created.codeHint)).toBe(true)
  })

  it('rejects malformed codes and prioritizes terminal states', () => {
    expect(normalizeTeamInviteCode('not-a-code')).toBeNull()
    expect(
      teamInviteCodeStatus({
        redeemedAt: new Date(),
        revokedAt: new Date(),
        expiresAt: new Date(0)
      })
    ).toBe('redeemed')
  })
})
