import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { teamServerOpenCodeEnvironment } from './team-server-opencode-environment'

describe('teamServerOpenCodeEnvironment', () => {
  it('isolates OpenCode configuration and keeps the key out of config JSON', () => {
    const directory = join('runtime', 'teamrun-agent-test')
    const environment = teamServerOpenCodeEnvironment(directory, {
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'private-model-key',
      model: 'review-model'
    })

    expect(environment.HOME).toBe(directory)
    expect(environment.TEAMRUN_MODEL_API_KEY).toBe('private-model-key')
    expect(environment.OPENCODE_CONFIG_CONTENT).not.toContain('private-model-key')
    expect(JSON.parse(environment.OPENCODE_CONFIG_CONTENT!)).toMatchObject({
      permission: 'deny',
      provider: { teamrun: { models: { 'review-model': { name: 'review-model' } } } }
    })
  })
})
