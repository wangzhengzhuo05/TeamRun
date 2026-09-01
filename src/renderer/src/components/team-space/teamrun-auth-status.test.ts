import { describe, expect, it } from 'vitest'
import { normalizeTeamRunAuthStatus } from './teamrun-auth-status'

describe('normalizeTeamRunAuthStatus', () => {
  it('turns a missing Web preload response into a stable error state', () => {
    expect(normalizeTeamRunAuthStatus(undefined)).toMatchObject({
      state: 'error',
      message: expect.stringContaining('invalid response')
    })
  })

  it('preserves a valid signed-in response', () => {
    expect(
      normalizeTeamRunAuthStatus({
        state: 'signed-in',
        apiUrl: 'https://teamrun.example.com',
        devAuth: false,
        sharedKeyAuth: true,
        email: null,
        userId: 'user-1'
      })
    ).toEqual({
      state: 'signed-in',
      apiUrl: 'https://teamrun.example.com',
      devAuth: false,
      sharedKeyAuth: true,
      email: null,
      userId: 'user-1'
    })
  })

  it('keeps old server responses compatible without guessing an identity', () => {
    expect(
      normalizeTeamRunAuthStatus({
        state: 'signed-in',
        apiUrl: 'https://teamrun.example.com',
        devAuth: false,
        sharedKeyAuth: true,
        email: 'member@example.com'
      })
    ).toMatchObject({ state: 'signed-in', userId: null })
  })
})
