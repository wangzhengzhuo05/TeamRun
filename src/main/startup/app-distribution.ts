export type OrcaAppDistribution = 'official' | 'self-hosted'

export const ORCA_APP_DISTRIBUTION_ENV = 'ORCA_APP_DISTRIBUTION'
export const SELF_HOSTED_APP_ID = 'com.wangzhengzhuo.orca.selfhosted'
export const SELF_HOSTED_APP_NAME = 'Orca Self-Hosted'
export const SELF_HOSTED_PACKAGE_NAME = 'orca-self-hosted'
export const SELF_HOSTED_USER_DATA_DIR = 'orca-self-hosted'

export function resolveOrcaAppDistribution(appName: string): OrcaAppDistribution {
  return appName === SELF_HOSTED_PACKAGE_NAME || appName === SELF_HOSTED_APP_NAME
    ? 'self-hosted'
    : 'official'
}

export function configureOrcaAppDistributionEnv(
  distribution: OrcaAppDistribution,
  env: NodeJS.ProcessEnv = process.env
): void {
  env[ORCA_APP_DISTRIBUTION_ENV] = distribution
}

export function isSelfHostedOrcaDistribution(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ORCA_APP_DISTRIBUTION_ENV] === 'self-hosted'
}
