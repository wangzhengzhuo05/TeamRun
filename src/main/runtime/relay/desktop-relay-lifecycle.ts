import { createHash } from 'node:crypto'
import type { OrcaCloudAuthConfig } from '../../orca-profiles/profile-cloud-auth-config'
import { getOrcaCloudAuthConfig } from '../../orca-profiles/profile-cloud-auth-config'
import type { OrcaRuntimeRpcServer } from '../runtime-rpc'
import { DesktopRelayService } from './desktop-relay-service'
import type { RelayAuthContext } from './relay-auth-coordinator'
import type { RelayBrokerStatus } from './relay-session-broker'
import {
  readActiveSelfHostedRelayConfig,
  readMobileRelayConfiguration
} from './self-hosted-relay-config'

type DesktopRelayLifecycleOptions = {
  runtimeRpc: OrcaRuntimeRpcServer
  profileUserDataPath: string
  relayConfigUserDataPath: string
  appVersion: string
  onStatus: (status: RelayBrokerStatus) => void
}

function selfHostedIdentity(serverUrl: string): RelayAuthContext['identity'] {
  const id = createHash('sha256').update(serverUrl).digest('base64url').slice(0, 24)
  return { userId: `self-hosted:${id}`, profileId: 'default', organizationId: '' }
}

function selfHostedAuthConfig(serverUrl: string): OrcaCloudAuthConfig {
  return {
    apiBaseUrl: serverUrl,
    authorizeEndpoint: serverUrl,
    sessionEndpoint: serverUrl,
    refreshEndpoint: serverUrl,
    capabilitiesEndpoint: serverUrl,
    profileEndpoint: serverUrl,
    orgEndpoint: serverUrl,
    logoutEndpoint: serverUrl,
    relayTokenEndpoint: `${serverUrl}/v1/auth/relay-token`,
    relayDirectorUrl: serverUrl,
    clientId: 'orca-self-hosted-relay',
    scope: ''
  }
}

export class DesktopRelayLifecycle {
  private readonly options: DesktopRelayLifecycleOptions
  private service: DesktopRelayService | null = null
  private backend: 'orca' | 'self-hosted' | null = null

  constructor(options: DesktopRelayLifecycleOptions) {
    this.options = options
  }

  start(): void {
    this.replaceService()
  }

  reconfigure(): void {
    this.replaceService()
  }

  authMutated(): void {
    if (this.backend === 'orca') {
      this.service?.authMutated()
    }
  }

  fenceOfficialAuth(): void {
    if (this.backend === 'orca') {
      this.service?.fenceAndCloseNow()
    }
  }

  ensureLive(): void {
    this.service?.ensureLive()
  }

  stop(): void {
    this.options.runtimeRpc.setMobileRelayPairingProvider(null)
    this.service?.stop()
    this.service = null
    this.backend = null
    this.options.onStatus('offline')
  }

  private replaceService(): void {
    this.options.runtimeRpc.setMobileRelayPairingProvider(null)
    this.service?.stop()
    this.service = null
    this.backend = null

    const selection = readMobileRelayConfiguration(this.options.relayConfigUserDataPath)
    const selfHosted =
      selection.backend === 'self-hosted'
        ? readActiveSelfHostedRelayConfig(this.options.relayConfigUserDataPath)
        : null
    if (selection.backend === 'self-hosted' && !selfHosted) {
      this.options.onStatus('offline')
      return
    }
    const cloud = getOrcaCloudAuthConfig()
    const authConfig = selfHosted?.serverUrl
      ? selfHostedAuthConfig(selfHosted.serverUrl)
      : cloud.configured
        ? cloud.config
        : null
    if (!authConfig) {
      this.options.onStatus('offline')
      return
    }
    try {
      const identity = selfHosted ? selfHostedIdentity(selfHosted.serverUrl) : null
      const service = new DesktopRelayService({
        authConfig,
        userDataPath: this.options.profileUserDataPath,
        appVersion: this.options.appVersion,
        runtimeRpc: this.options.runtimeRpc,
        onStatus: this.options.onStatus,
        ...(selfHosted && identity
          ? {
              readAuthContext: async (): Promise<RelayAuthContext> => ({
                identity,
                accessToken: selfHosted.accessToken,
                relayEntitled: true
              })
            }
          : {})
      })
      this.backend = selfHosted ? 'self-hosted' : 'orca'
      this.service = service
      this.options.runtimeRpc.setMobileRelayPairingProvider({
        createPairingRelay: (relayDeviceId) => service.createPairingRelay(relayDeviceId),
        onDeviceRevokeQueued: (item) => service.onDeviceRevokeQueued(item),
        onDemandStateChanged: () => service.demandStateChanged(),
        getEndpoints: (context, params) => service.getEndpoints(context, params),
        provisionRelay: (context, params) => service.provisionRelay(context, params)
      })
      service.start()
    } catch (error) {
      this.options.onStatus('offline')
      console.warn(
        '[relay] Desktop relay startup unavailable:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
