import { describe, expect, it } from 'vitest'
import {
  configureOrcaAppDistributionEnv,
  isSelfHostedOrcaDistribution,
  resolveOrcaAppDistribution
} from './app-distribution'

describe('app-distribution', () => {
  it('recognizes the self-hosted package and display names', () => {
    expect(resolveOrcaAppDistribution('orca-self-hosted')).toBe('self-hosted')
    expect(resolveOrcaAppDistribution('Orca Self-Hosted')).toBe('self-hosted')
    expect(resolveOrcaAppDistribution('orca')).toBe('official')
    expect(resolveOrcaAppDistribution('teamrun')).toBe('teamrun')
    expect(resolveOrcaAppDistribution('TeamRun')).toBe('teamrun')
  })

  it('canonicalizes the distribution environment for runtime services', () => {
    const env = { ORCA_APP_DISTRIBUTION: 'stale' }

    configureOrcaAppDistributionEnv('self-hosted', env)

    expect(isSelfHostedOrcaDistribution(env)).toBe(true)
  })
})
