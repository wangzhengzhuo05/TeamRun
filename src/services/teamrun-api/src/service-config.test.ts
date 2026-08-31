import { describe, expect, it } from 'vitest'
import { readTeamRunServiceConfig } from './service-config.js'

describe('readTeamRunServiceConfig', () => {
  it('accepts shared key authentication in production', () => {
    const config = readTeamRunServiceConfig({
      NODE_ENV: 'production',
      TEAMRUN_SHARED_KEY: 'teamrun-test-key-that-is-long-enough'
    })
    expect(config.TEAMRUN_DEV_AUTH).toBe('0')
    expect(config.TEAMRUN_SHARED_KEY_EMAIL).toBe('team@teamrun.local')
  })

  it('requires a production authentication method', () => {
    expect(() => readTeamRunServiceConfig({ NODE_ENV: 'production' })).toThrow(
      'A shared key or OIDC'
    )
  })

  it('rejects development authentication in production', () => {
    expect(() =>
      readTeamRunServiceConfig({ NODE_ENV: 'production', TEAMRUN_DEV_AUTH: '1' })
    ).toThrow('TEAMRUN_DEV_AUTH cannot run in production')
  })

  it('rejects malformed Team Server encryption keys', () => {
    expect(() =>
      readTeamRunServiceConfig({
        TEAMRUN_DEV_AUTH: '1',
        TEAMRUN_RUNTIME_ENCRYPTION_KEY: 'not-a-32-byte-key'
      })
    ).toThrow('Expected a 32-byte base64 key')
  })
})
