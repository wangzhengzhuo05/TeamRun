import type { Store } from '../persistence'
import { gitExecFileAsync } from '../git/runner'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { TeamRunRuntimePublicationResult } from '../../shared/teamrun-runtime'
import type { TeamRunWorkspaceReview } from '../../shared/teamrun-cloud'
import type { TeamRunApiClient } from './teamrun-api-client'
import { callTeamRunRuntime } from './teamrun-runtime-client'
import { resolveTeamRunWorkspaceTarget } from './teamrun-workspace-target'
import { collectTeamRunGitResult, TEAMRUN_DIFF_MAX_BYTES } from './teamrun-git-result'

export class TeamRunWorkspaceReviewService {
  constructor(
    private readonly store: Store,
    private readonly client: TeamRunApiClient,
    private readonly userDataPath: string
  ) {}

  async read(args: { runId: string; clientRunId: string }): Promise<TeamRunWorkspaceReview> {
    const workspace = this.client.getWorkspaceLink(args.clientRunId)
    if (!workspace || workspace.agentRunId !== args.runId || !workspace.baseRevision) {
      throw new Error('TeamRun workspace link is incomplete on this device.')
    }
    if (workspace.baseRevision.kind === 'folder') {
      return {
        baseRevision: workspace.baseRevision,
        headRevision: workspace.baseRevision,
        commitGitObjectIds: [],
        hasUncommittedChanges: false,
        unifiedDiff: ''
      }
    }
    const target = resolveTeamRunWorkspaceTarget(this.store, workspace)
    const result = target.runtimeEnvironmentId
      ? await callTeamRunRuntime<TeamRunRuntimePublicationResult>({
          userDataPath: this.userDataPath,
          environmentId: target.runtimeEnvironmentId,
          method: 'teamrun.preparePublication',
          params: {
            worktree: workspace.workspaceId,
            baseObjectId: workspace.baseRevision.objectId,
            includeDiff: true
          },
          timeoutMs: 90_000
        })
      : await this.#readGit(target.path, target.connectionId, workspace.baseRevision.objectId)
    return {
      baseRevision: workspace.baseRevision,
      headRevision: { kind: 'git', objectId: result.headObjectId },
      commitGitObjectIds: result.commitObjectIds,
      hasUncommittedChanges: result.hasUncommittedChanges ?? false,
      unifiedDiff: result.unifiedDiff ?? ''
    }
  }

  async #readGit(
    workspacePath: string,
    connectionId: string | null,
    baseObjectId: string
  ): Promise<TeamRunRuntimePublicationResult> {
    const git = async (argv: string[]) => {
      if (connectionId) {
        const provider = getSshGitProvider(connectionId)
        if (!provider) {
          throw new Error('TeamRun SSH workspace is not connected.')
        }
        return provider.exec(argv, workspacePath, { timeoutMs: 60_000 })
      }
      return gitExecFileAsync(argv, {
        cwd: workspacePath,
        timeout: 60_000,
        maxBuffer: TEAMRUN_DIFF_MAX_BYTES + 1024
      })
    }
    return collectTeamRunGitResult({
      git,
      workspacePath,
      connectionId,
      baseObjectId,
      includeDiff: true
    })
  }
}
