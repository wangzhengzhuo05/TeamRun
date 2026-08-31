import { describe, expect, it } from 'vitest'
import { deterministicTeamServerRunId } from './team-server-run-identity.js'

describe('Team Server run identity', () => {
  it('derives a stable UUID from the mutation identity', () => {
    const input = {
      userId: '2ea670a8-384a-4be8-8411-bd4d4e280125',
      taskId: '71689167-7125-4c5e-9b16-ae78b7f52226',
      idempotencyKey: 'start-1'
    }

    expect(deterministicTeamServerRunId(input)).toBe(deterministicTeamServerRunId(input))
    expect(deterministicTeamServerRunId(input)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(deterministicTeamServerRunId({ ...input, idempotencyKey: 'start-2' })).not.toBe(
      deterministicTeamServerRunId(input)
    )
  })
})
