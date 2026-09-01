import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { teamServerOpenCodeEnvironment } from './team-server-opencode-environment'

describe('teamServerOpenCodeEnvironment', () => {
  it('isolates OpenCode configuration and keeps the key out of the environment', () => {
    const directory = join('runtime', 'teamrun-agent-test')
    const environment = teamServerOpenCodeEnvironment(directory, {
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'private-model-key',
      model: 'review-model'
    })

    expect(environment.HOME).toBe(directory)
    expect(environment.TEAMRUN_MODEL_API_KEY).toBeUndefined()
    expect(environment.OPENCODE_CONFIG_CONTENT).not.toContain('private-model-key')
    expect(JSON.parse(environment.OPENCODE_CONFIG_CONTENT!)).toMatchObject({
      permission: 'deny',
      provider: {
        teamrun: {
          options: { apiKey: expect.stringContaining('{file:') },
          models: { 'review-model': { name: 'review-model' } }
        }
      }
    })
  })

  it('allows YOLO work only inside the run and still blocks secrets and pushes', () => {
    const environment = teamServerOpenCodeEnvironment(
      join('runtime', 'teamrun-development-test'),
      {
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'private-model-key',
        model: 'build-model'
      },
      'development-yolo'
    )

    expect(JSON.parse(environment.OPENCODE_CONFIG_CONTENT!)).toMatchObject({
      permission: {
        '*': 'allow',
        read: { '.env': 'deny', '*.env': 'deny', '**/.env': 'deny' },
        bash: { 'git push': 'deny', 'git push *': 'deny', '*git push*': 'deny' },
        external_directory: 'deny',
        question: 'deny'
      }
    })
  })
})
