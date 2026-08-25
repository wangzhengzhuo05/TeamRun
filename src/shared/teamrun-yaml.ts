import { parseDocument } from 'yaml'
import type { OrcaHooks, TeamRunVerificationCommand } from './orca-yaml-hook-types'
import {
  isOrcaYamlFieldWithinLimit,
  isOrcaYamlTextWithinLimit,
  MAX_ORCA_YAML_ALIAS_COUNT,
  MAX_ORCA_YAML_COLLECTION_ENTRIES
} from './orca-yaml-file-limit'
import { parseOrcaYaml } from './orca-yaml'

const VERIFICATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' || !isOrcaYamlFieldWithinLimit(value)) {
    return null
  }
  return value.trim() || null
}

function parseVerificationCommands(value: unknown): TeamRunVerificationCommand[] {
  if (!Array.isArray(value) || value.length > MAX_ORCA_YAML_COLLECTION_ENTRIES) {
    return []
  }
  const seen = new Set<string>()
  const commands: TeamRunVerificationCommand[] = []
  for (const entry of value) {
    const item = record(entry)
    const id = text(item?.id)
    const label = text(item?.label)
    const command = text(item?.command)
    if (!id || !VERIFICATION_ID_PATTERN.test(id) || !label || !command || seen.has(id)) {
      continue
    }
    seen.add(id)
    commands.push({ id, label, command })
  }
  return commands
}

export function parseTeamRunYaml(content: string): OrcaHooks | null {
  if (!isOrcaYamlTextWithinLimit(content)) {
    return null
  }
  let root: unknown
  try {
    const document = parseDocument(content, {
      keepSourceTokens: false,
      logLevel: 'silent',
      prettyErrors: false,
      uniqueKeys: true
    })
    if (document.errors.length > 0) {
      return null
    }
    root = document.toJS({ maxAliasCount: MAX_ORCA_YAML_ALIAS_COUNT })
  } catch {
    return null
  }
  const base = parseOrcaYaml(content)
  const rootRecord = record(root)
  const scripts = record(rootRecord?.scripts)
  const verify = parseVerificationCommands(scripts?.verify)
  if (!base && verify.length === 0) {
    return null
  }
  return {
    scripts: {
      ...base?.scripts,
      ...(verify.length > 0 ? { verify } : {})
    },
    ...(base?.issueCommand ? { issueCommand: base.issueCommand } : {}),
    ...(base?.defaultTabs ? { defaultTabs: base.defaultTabs } : {}),
    ...(base?.environmentRecipes ? { environmentRecipes: base.environmentRecipes } : {}),
    ...(base?.environmentRecipeDiagnostics
      ? { environmentRecipeDiagnostics: base.environmentRecipeDiagnostics }
      : {}),
    ...(base?.worktree ? { worktree: base.worktree } : {})
  }
}

export function mergeTeamRunProjectConfig(
  teamRun: OrcaHooks | null,
  orca: OrcaHooks | null
): OrcaHooks | null {
  if (!teamRun && !orca) {
    return null
  }
  const scripts = {
    ...((teamRun?.scripts.setup ?? orca?.scripts.setup)
      ? { setup: teamRun?.scripts.setup ?? orca?.scripts.setup }
      : {}),
    ...((teamRun?.scripts.archive ?? orca?.scripts.archive)
      ? { archive: teamRun?.scripts.archive ?? orca?.scripts.archive }
      : {}),
    ...(teamRun?.scripts.verify ? { verify: teamRun.scripts.verify } : {})
  }
  return {
    scripts,
    ...((teamRun?.issueCommand ?? orca?.issueCommand)
      ? { issueCommand: teamRun?.issueCommand ?? orca?.issueCommand }
      : {}),
    ...((teamRun?.defaultTabs ?? orca?.defaultTabs)
      ? { defaultTabs: teamRun?.defaultTabs ?? orca?.defaultTabs }
      : {}),
    ...((teamRun?.environmentRecipes ?? orca?.environmentRecipes)
      ? { environmentRecipes: teamRun?.environmentRecipes ?? orca?.environmentRecipes }
      : {}),
    ...((teamRun?.environmentRecipeDiagnostics ?? orca?.environmentRecipeDiagnostics)
      ? {
          environmentRecipeDiagnostics:
            teamRun?.environmentRecipeDiagnostics ?? orca?.environmentRecipeDiagnostics
        }
      : {}),
    ...((teamRun?.worktree ?? orca?.worktree)
      ? { worktree: teamRun?.worktree ?? orca?.worktree }
      : {})
  }
}
