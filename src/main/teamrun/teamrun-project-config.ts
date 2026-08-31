import type { OrcaHooks } from '../../shared/orca-yaml-hook-types'
import type { Repo } from '../../shared/repo-types'
import { parseOrcaYaml } from '../../shared/orca-yaml'
import { mergeTeamRunProjectConfig, parseTeamRunYaml } from '../../shared/teamrun-yaml'
import { loadHooks } from '../hooks'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { joinWorktreeRelativePath } from '../runtime/runtime-relative-paths'

async function readRemoteConfig(
  workspacePath: string,
  connectionId: string,
  fileName: string,
  parse: (content: string) => OrcaHooks | null
): Promise<OrcaHooks | null> {
  const provider = getSshFilesystemProvider(connectionId)
  if (!provider) {
    throw new Error('TeamRun SSH workspace is not connected.')
  }
  try {
    const result = await provider.readFile(joinWorktreeRelativePath(workspacePath, fileName))
    return result.isBinary ? null : parse(result.content)
  } catch {
    return null
  }
}

export async function loadTeamRunWorkspaceConfig(
  workspacePath: string,
  connectionId: string | null
): Promise<OrcaHooks | null> {
  if (!connectionId) {
    return loadHooks(workspacePath)
  }
  const [teamRun, orca] = await Promise.all([
    readRemoteConfig(workspacePath, connectionId, 'teamrun.yaml', parseTeamRunYaml),
    readRemoteConfig(workspacePath, connectionId, 'orca.yaml', parseOrcaYaml)
  ])
  return mergeTeamRunProjectConfig(teamRun, orca)
}

export async function loadTeamRunProjectConfig(repo: Repo): Promise<OrcaHooks | null> {
  return loadTeamRunWorkspaceConfig(repo.path, repo.connectionId ?? null)
}
