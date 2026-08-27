import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>()

  get length(): number {
    return this.#values.size
  }

  clear(): void {
    this.#values.clear()
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.#values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.#values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

function installWindow(): Window & typeof globalThis {
  const storage = new MemoryStorage()
  storage.setItem(
    'orca.web.runtimeEnvironment.v1',
    JSON.stringify({
      id: 'web-teamrun',
      name: 'TeamRun test',
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      runtimeId: null,
      preferredEndpointId: 'websocket',
      endpoints: [
        {
          id: 'websocket',
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'ws://127.0.0.1:1234',
          deviceToken: 'token',
          publicKeyB64: 'public-key'
        }
      ]
    })
  )
  const webWindow = {
    localStorage: storage,
    location: { protocol: 'http:', reload: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64')
  } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', webWindow)
  vi.stubGlobal('navigator', { userAgent: 'Linux', hardwareConcurrency: 8 })
  return webWindow
}

describe('Web TeamRun preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('routes TeamRun auth and organization calls through the paired runtime', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
          calls.push({ method, params })
          const operation = (params as { operation?: string })?.operation
          return Promise.resolve({
            id: String(calls.length),
            ok: true,
            result:
              operation === 'auth.status'
                ? {
                    state: 'signed-out',
                    apiUrl: 'https://teamrun.example.com',
                    devAuth: false,
                    sharedKeyAuth: true
                  }
                : [{ id: 'organization-1', slug: 'team', name: 'Team' }],
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))
    const webWindow = installWindow()
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(webWindow.api.teamRun.auth.status()).resolves.toMatchObject({
      state: 'signed-out',
      sharedKeyAuth: true
    })
    await expect(webWindow.api.teamRun.organizations.list()).resolves.toMatchObject([
      { id: 'organization-1' }
    ])
    expect(calls).toEqual([
      { method: 'teamrun.cloudInvoke', params: { operation: 'auth.status' } },
      { method: 'teamrun.cloudInvoke', params: { operation: 'organizations.list' } }
    ])
  })

  it('returns an error auth state when paired to an older runtime', async () => {
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: 'missing',
            ok: false,
            error: { code: 'method_not_found', message: 'Unknown method: teamrun.cloudInvoke' },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))
    const webWindow = installWindow()
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(webWindow.api.teamRun.auth.status()).resolves.toMatchObject({
      state: 'error',
      message: expect.stringContaining('teamrun.cloudInvoke')
    })
  })
})
