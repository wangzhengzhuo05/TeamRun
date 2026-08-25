import { createHash } from 'node:crypto'
import path from 'node:path'
import type { AppIdentity } from '../../shared/app-identity'
import {
  SELF_HOSTED_APP_ID,
  SELF_HOSTED_APP_NAME,
  TEAMRUN_APP_ID,
  TEAMRUN_APP_NAME,
  type OrcaAppDistribution
} from './app-distribution'

const ORCA_APP_NAME = 'TeamRun'
const ORCA_APP_USER_MODEL_ID = 'com.stablyai.orca'
const MAX_LABEL_LENGTH = 80

export type DevInstanceIdentity = AppIdentity & {
  appUserModelId: string
  // Why: drives app.setName → the macOS safeStorage Keychain item name
  // ("<appName> Safe Storage"). Kept stable across dev branches (unlike the
  // per-branch `name`) so every dev instance shares one Keychain key instead of
  // creating a new one per branch and re-prompting. Distinct from prod's 'TeamRun'.
  appName: string
}

function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length > MAX_LABEL_LENGTH
    ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 3)}...`
    : trimmed
}

function lastPathSegment(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  return normalized.split('/').findLast(Boolean) ?? value
}

function formatLabel(branch: string | null, worktreeName: string | null): string | null {
  if (branch && worktreeName) {
    if (branch === worktreeName || lastPathSegment(branch) === worktreeName) {
      return worktreeName
    }
    return `${worktreeName} @ ${branch}`
  }
  return branch ?? worktreeName
}

function createDevAppUserModelId(identityKey: string | null, baseAppUserModelId: string): string {
  if (!identityKey) {
    return baseAppUserModelId
  }
  const hash = createHash('sha1').update(identityKey).digest('hex').slice(0, 10)
  return `${baseAppUserModelId}.dev.${hash}`
}

export function getDevInstanceIdentity(
  isDev: boolean,
  env: NodeJS.ProcessEnv = process.env,
  distribution: OrcaAppDistribution = 'teamrun'
): DevInstanceIdentity {
  const baseAppName = distribution === 'teamrun' ? TEAMRUN_APP_NAME : ORCA_APP_NAME
  const baseAppUserModelId = distribution === 'teamrun' ? TEAMRUN_APP_ID : ORCA_APP_USER_MODEL_ID
  if (!isDev) {
    const appName = distribution === 'self-hosted' ? SELF_HOSTED_APP_NAME : baseAppName
    return {
      name: appName,
      appName,
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null,
      appUserModelId: distribution === 'self-hosted' ? SELF_HOSTED_APP_ID : baseAppUserModelId
    }
  }

  const repoRoot = cleanEnvValue(env.TEAMRUN_DEV_REPO_ROOT) ?? cleanEnvValue(env.ORCA_DEV_REPO_ROOT)
  const branch = cleanEnvValue(env.TEAMRUN_DEV_BRANCH) ?? cleanEnvValue(env.ORCA_DEV_BRANCH)
  const worktreeName =
    cleanEnvValue(env.TEAMRUN_DEV_WORKTREE_NAME) ??
    cleanEnvValue(env.ORCA_DEV_WORKTREE_NAME) ??
    cleanEnvValue(path.basename(repoRoot ?? process.cwd()))
  const devLabel =
    cleanEnvValue(env.TEAMRUN_DEV_INSTANCE_LABEL) ??
    cleanEnvValue(env.ORCA_DEV_INSTANCE_LABEL) ??
    formatLabel(branch, worktreeName)
  const dockTitle =
    cleanEnvValue(env.TEAMRUN_DEV_DOCK_TITLE) ??
    cleanEnvValue(env.ORCA_DEV_DOCK_TITLE) ??
    `${baseAppName}: ${branch ?? devLabel ?? 'dev'}`

  return {
    name: dockTitle,
    // Why: one stable Keychain key ('TeamRun Dev Safe Storage') for all dev
    // branches; the per-branch identity still shows via `name` (window title,
    // app menu, renderer label).
    appName: `${baseAppName} Dev`,
    isDev: true,
    devLabel,
    devBranch: branch,
    devWorktreeName: worktreeName,
    devRepoRoot: repoRoot,
    dockBadgeLabel: null,
    appUserModelId: createDevAppUserModelId(repoRoot ?? devLabel, baseAppUserModelId)
  }
}
