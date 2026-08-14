import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeRpcServer } from '../runtime-rpc'

const mocks = vi.hoisted(() => ({
  cloudConfigured: true,
  selection: { backend: 'orca' as 'orca' | 'self-hosted' },
  activeSelfHosted: null as { serverUrl: string; accessToken: string; revision: number } | null,
  serviceOptions: [] as Record<string, unknown>[],
  serviceStart: vi.fn(),
  serviceStop: vi.fn()
}))

vi.mock('../../orca-profiles/profile-cloud-auth-config', () => ({
  getOrcaCloudAuthConfig: () => ({
    configured: mocks.cloudConfigured,
    config: {
      relayTokenEndpoint: 'https://official.example/v1/token',
      relayDirectorUrl: 'https://official.example'
    }
  })
}))

vi.mock('./self-hosted-relay-config', () => ({
  readMobileRelayConfiguration: () => ({
    ...mocks.selection,
    serverUrl: null,
    configured: mocks.activeSelfHosted !== null,
    credentialStored: false,
    revision: 0
  }),
  readActiveSelfHostedRelayConfig: () => mocks.activeSelfHosted
}))

vi.mock('./desktop-relay-service', () => ({
  DesktopRelayService: class {
    constructor(options: Record<string, unknown>) {
      mocks.serviceOptions.push(options)
    }
    start = mocks.serviceStart
    stop = mocks.serviceStop
    authMutated = vi.fn()
    fenceAndCloseNow = vi.fn()
    ensureLive = vi.fn()
    createPairingRelay = vi.fn()
    onDeviceRevokeQueued = vi.fn()
    demandStateChanged = vi.fn()
    getEndpoints = vi.fn()
    provisionRelay = vi.fn()
  }
}))

import { DesktopRelayLifecycle } from './desktop-relay-lifecycle'

describe('DesktopRelayLifecycle', () => {
  const setMobileRelayPairingProvider = vi.fn()
  const onStatus = vi.fn()

  beforeEach(() => {
    mocks.cloudConfigured = true
    mocks.selection = { backend: 'orca' }
    mocks.activeSelfHosted = null
    mocks.serviceOptions.length = 0
    mocks.serviceStart.mockClear()
    mocks.serviceStop.mockClear()
    setMobileRelayPairingProvider.mockClear()
    onStatus.mockClear()
  })

  function lifecycle(): DesktopRelayLifecycle {
    return new DesktopRelayLifecycle({
      runtimeRpc: { setMobileRelayPairingProvider } as unknown as OrcaRuntimeRpcServer,
      profileUserDataPath: '/profile',
      relayConfigUserDataPath: '/global',
      appVersion: 'test',
      onStatus
    })
  }

  it('fails closed instead of falling back to Orca when private credentials are unavailable', () => {
    mocks.selection = { backend: 'self-hosted' }

    lifecycle().start()

    expect(mocks.serviceOptions).toHaveLength(0)
    expect(setMobileRelayPairingProvider).toHaveBeenLastCalledWith(null)
    expect(onStatus).toHaveBeenLastCalledWith('offline')
  })

  it('starts self-hosted Relay with the saved key and no Orca auth context', async () => {
    mocks.selection = { backend: 'self-hosted' }
    mocks.activeSelfHosted = {
      serverUrl: 'https://relay.example.test',
      accessToken: 'private-access-key-that-is-long-enough',
      revision: 1
    }

    lifecycle().start()

    expect(mocks.serviceStart).toHaveBeenCalledOnce()
    const options = mocks.serviceOptions[0]!
    expect(options.authConfig).toMatchObject({
      relayTokenEndpoint: 'https://relay.example.test/v1/auth/relay-token',
      relayDirectorUrl: 'https://relay.example.test'
    })
    await expect(
      (options.readAuthContext as () => Promise<Record<string, unknown>>)()
    ).resolves.toMatchObject({
      accessToken: 'private-access-key-that-is-long-enough',
      relayEntitled: true
    })
  })
})
