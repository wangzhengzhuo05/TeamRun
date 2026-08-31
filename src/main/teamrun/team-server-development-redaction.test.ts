import { describe, expect, it } from 'vitest'
import { redactTeamServerDevelopmentOutput } from './team-server-development-redaction'

describe('Team Server development output redaction', () => {
  it('redacts the configured model key even when it has no known provider prefix', () => {
    expect(
      redactTeamServerDevelopmentOutput('model output: private-model-key', ['private-model-key'])
    ).toBe('model output: [redacted:model-key]')
  })
})
