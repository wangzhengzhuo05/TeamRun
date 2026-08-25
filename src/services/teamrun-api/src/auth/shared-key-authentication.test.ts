import { describe, expect, it } from 'vitest'
import { matchesTeamRunSharedKey, teamRunSharedKeyIdentity } from './shared-key-authentication.js'

describe('shared key authentication', () => {
  it('matches only the configured key', () => {
    expect(matchesTeamRunSharedKey('a'.repeat(32), 'a'.repeat(32))).toBe(true)
    expect(matchesTeamRunSharedKey('b'.repeat(32), 'a'.repeat(32))).toBe(false)
  })

  it('creates a stable service identity', () => {
    expect(
      teamRunSharedKeyIdentity({
        TEAMRUN_SHARED_KEY_EMAIL: 'TEAM@EXAMPLE.COM',
        TEAMRUN_SHARED_KEY_DISPLAY_NAME: 'TeamRun Pilot'
      } as Parameters<typeof teamRunSharedKeyIdentity>[0])
    ).toEqual({
      subject: 'shared-key:team@example.com',
      email: 'team@example.com',
      displayName: 'TeamRun Pilot'
    })
  })
})
