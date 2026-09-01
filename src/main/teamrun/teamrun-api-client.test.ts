import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamRunApiClient } from './teamrun-api-client'
import type { TeamRunAuthService } from './teamrun-auth-service'
import type { TeamRunLocalCache } from './teamrun-local-cache'

afterEach(() => vi.unstubAllGlobals())

describe('TeamRun API cache policy', () => {
  it('never persists or replays short-lived artifact URLs', async () => {
    const cache = {
      listPendingMutations: vi.fn(() => []),
      getResponse: vi.fn(),
      putResponse: vi.fn()
    } as unknown as TeamRunLocalCache
    const auth = {
      apiUrl: 'https://teamrun.example',
      cacheScope: vi.fn(() => 'member-scope'),
      authorizationHeader: vi.fn(async () => 'Bearer token')
    } as unknown as TeamRunAuthService
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([{ downloadUrl: 'https://objects.example/signed?secret=value' }])
      )
    )

    const client = new TeamRunApiClient(auth, cache)
    await client.request('/v1/publications/result/artifacts', { cache: false })

    expect(cache.getResponse).not.toHaveBeenCalled()
    expect(cache.putResponse).not.toHaveBeenCalled()
  })

  it('queues later writes behind a blocked outbox head', async () => {
    const pending = [
      {
        id: 'first',
        method: 'POST' as const,
        path: '/v1/projects/project/tasks',
        body: { title: 'First' },
        idempotencyKey: 'first-key',
        createdAt: 1
      }
    ]
    const cache = {
      listPendingMutations: vi.fn(() => pending),
      deletePendingMutation: vi.fn(),
      enqueueMutation: vi.fn()
    } as unknown as TeamRunLocalCache
    const auth = {
      apiUrl: 'https://teamrun.example',
      cacheScope: vi.fn(() => 'member-scope'),
      authorizationHeader: vi.fn(async () => 'Bearer token')
    } as unknown as TeamRunAuthService
    const fetch = vi.fn(async () => Response.json({ message: 'Version conflict' }, { status: 409 }))
    vi.stubGlobal('fetch', fetch)

    const client = new TeamRunApiClient(auth, cache)
    await expect(
      client.request('/v1/projects/project/tasks', {
        method: 'POST',
        body: { title: 'Second' }
      })
    ).rejects.toMatchObject({ code: 'teamrun_mutation_queued' })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(cache.enqueueMutation).toHaveBeenCalledWith(
      'member-scope',
      expect.objectContaining({ body: { title: 'Second' } })
    )
  })

  it('queues team discussion while offline', async () => {
    const cache = {
      listPendingMutations: vi.fn(() => []),
      enqueueMutation: vi.fn()
    } as unknown as TeamRunLocalCache
    const auth = {
      apiUrl: 'https://teamrun.example',
      cacheScope: vi.fn(() => 'member-scope'),
      authorizationHeader: vi.fn(async () => 'Bearer token')
    } as unknown as TeamRunAuthService
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )

    const client = new TeamRunApiClient(auth, cache)
    await expect(
      client.request('/v1/tasks/task/comments', {
        method: 'POST',
        body: { bodyMarkdown: 'Status update' }
      })
    ).rejects.toMatchObject({ code: 'teamrun_mutation_queued' })
    expect(cache.enqueueMutation).toHaveBeenCalledOnce()
  })
})
