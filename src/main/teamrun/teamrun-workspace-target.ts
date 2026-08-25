import type { Repo } from '../../shared/repo-types'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import type { Store } from '../persistence'
import type { TeamRunWorkspaceRecord } from './teamrun-local-cache'
import { getTeamRunRuntimeEnvironmentId } from './teamrun-runtime-client'

export type TeamRunWorkspaceTarget = {
  workspaceId: string
  path: string
  connectionId: string | null
  runtimeEnvironmentId: string | null
  repo: Repo | null
}

export function resolveTeamRunWorkspaceTarget(
  store: Store,
  workspace: TeamRunWorkspaceRecord
): TeamRunWorkspaceTarget {
  const scope = parseWorkspaceKey(workspace.workspaceId)
  if (scope?.type === 'folder') {
    const folder = store.getFolderWorkspace(scope.folderWorkspaceId)
    if (!folder || folder.folderPath !== workspace.workspacePath) {
      throw new Error('TeamRun folder workspace is no longer available on this device.')
    }
    return {
      workspaceId: workspace.workspaceId,
      path: folder.folderPath,
      connectionId: folder.connectionId ?? null,
      runtimeEnvironmentId: getTeamRunRuntimeEnvironmentId({
        executionHostId: folder.executionHostId ?? undefined
      }),
      repo: null
    }
  }
  const parsed = splitWorktreeIdForFilesystem(workspace.workspaceId)
  if (!parsed || parsed.worktreePath !== workspace.workspacePath) {
    throw new Error('TeamRun workspace link is invalid.')
  }
  if (!store.getWorktreeMeta(workspace.workspaceId)) {
    throw new Error('TeamRun workspace is no longer registered on this device.')
  }
  const repo = store.getRepo(parsed.repoId)
  if (!repo) throw new Error('TeamRun repository is no longer available.')
  return {
    workspaceId: workspace.workspaceId,
    path: parsed.worktreePath,
    connectionId: repo.connectionId ?? null,
    runtimeEnvironmentId: getTeamRunRuntimeEnvironmentId(repo),
    repo
  }
}
