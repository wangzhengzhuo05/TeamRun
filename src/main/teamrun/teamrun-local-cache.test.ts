import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TeamRunLocalCache } from './teamrun-local-cache'

const temporaryDirectories: string[] = []

function createCache(): TeamRunLocalCache {
  const directory = mkdtempSync(join(tmpdir(), 'teamrun-cache-'))
  temporaryDirectories.push(directory)
  return new TeamRunLocalCache(join(directory, 'cache.sqlite'))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('TeamRun local cache', () => {
  it('keeps the highest durable event cursor', () => {
    const cache = createCache()
    cache.putEventCursor('identity', 'organization', 9)
    cache.putEventCursor('identity', 'organization', 4)

    expect(cache.getEventCursor('identity', 'organization')).toBe(9)
    cache.close()
  })

  it('replays pending mutations in creation order', () => {
    const cache = createCache()
    cache.enqueueMutation('identity', {
      id: 'second',
      method: 'PATCH',
      path: '/v1/agent-runs/run/status',
      body: { sequence: 2 },
      idempotencyKey: 'key-2',
      createdAt: 2
    })
    cache.enqueueMutation('identity', {
      id: 'first',
      method: 'POST',
      path: '/v1/projects/project/tasks',
      body: { title: 'Task' },
      idempotencyKey: 'key-1',
      createdAt: 1
    })

    expect(cache.listPendingMutations('identity').map((mutation) => mutation.id)).toEqual([
      'first',
      'second'
    ])
    cache.deletePendingMutation('identity', 'first')
    expect(cache.listPendingMutations('identity')).toHaveLength(1)
    cache.close()
  })

  it('keeps verification output device-local and scoped to its run', () => {
    const cache = createCache()
    cache.putVerification('identity', {
      id: '0e9a3901-ee17-48ce-898a-adcc6c9479eb',
      agentRunId: '31f7d862-8745-4a49-b3b7-c56ee5ee866b',
      commandId: 'unit',
      commandLabel: 'Unit tests',
      command: 'pnpm test',
      exitCode: 0,
      durationMs: 42,
      output: 'passed',
      createdAt: '2026-08-24T00:00:00.000Z'
    })

    expect(
      cache.listVerifications('identity', '31f7d862-8745-4a49-b3b7-c56ee5ee866b')
    ).toMatchObject([{ commandId: 'unit', output: 'passed' }])
    expect(cache.listVerifications('other-user', '31f7d862-8745-4a49-b3b7-c56ee5ee866b')).toEqual(
      []
    )
    cache.close()
  })
})
