import { createHash, randomUUID } from 'node:crypto'
import type {
  PreparedPublication,
  PreparePublicationRequest,
  ResultPublication,
  VerificationResult,
  WorkspaceRevision
} from '../../shared/teamrun-api'
import type { Store } from '../persistence'
import { gitExecFileAsync } from '../git/runner'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { TeamRunApiClient } from './teamrun-api-client'
import type { TeamRunRuntimePublicationResult } from '../../shared/teamrun-runtime'
import { callTeamRunRuntime } from './teamrun-runtime-client'
import { resolveTeamRunWorkspaceTarget } from './teamrun-workspace-target'
import { collectTeamRunGitResult } from './teamrun-git-result'

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024

type PublishSelection = {
  runId: string
  clientRunId: string
  summaryMarkdown: string
  reviewUrl?: string | null
  includeDiff: boolean
  includeVerificationOutput: boolean
}

type ArtifactContent = PreparePublicationRequest['artifacts'][number] & { content: string }

function artifact(
  kind: ArtifactContent['kind'],
  fileName: string,
  content: string
): ArtifactContent {
  const byteSize = Buffer.byteLength(content)
  if (byteSize > MAX_ARTIFACT_BYTES) {
    throw new Error(`${fileName} exceeds the 5 MiB publication limit.`)
  }
  return {
    clientArtifactId: randomUUID(),
    kind,
    fileName,
    contentType: 'text/plain; charset=utf-8',
    byteSize,
    sha256: createHash('sha256').update(content).digest('hex'),
    content
  }
}

export class TeamRunPublicationService {
  constructor(
    private readonly store: Store,
    private readonly client: TeamRunApiClient,
    private readonly userDataPath: string
  ) {}

  async publish(selection: PublishSelection): Promise<ResultPublication> {
    const context = this.#workspace(selection)
    const git = async (args: string[]) => {
      if (context.connectionId) {
        const provider = getSshGitProvider(context.connectionId)
        if (!provider) {
          throw new Error('TeamRun SSH workspace is not connected.')
        }
        return provider.exec(args, context.path, { timeoutMs: 60_000 })
      }
      return gitExecFileAsync(args, {
        cwd: context.path,
        timeout: 60_000,
        maxBuffer: MAX_ARTIFACT_BYTES + 1024
      })
    }

    let headRevision: WorkspaceRevision = context.baseRevision
    let commits: string[] = []
    const artifacts: ArtifactContent[] = []
    if (context.baseRevision.kind === 'git') {
      const preparedWorkspace = context.runtimeEnvironmentId
        ? await callTeamRunRuntime<TeamRunRuntimePublicationResult>({
            userDataPath: this.userDataPath,
            environmentId: context.runtimeEnvironmentId,
            method: 'teamrun.preparePublication',
            params: {
              worktree: context.workspaceId,
              baseObjectId: context.baseRevision.objectId,
              includeDiff: selection.includeDiff
            },
            timeoutMs: 90_000
          })
        : await collectTeamRunGitResult({
            git,
            workspacePath: context.path,
            connectionId: context.connectionId,
            baseObjectId: context.baseRevision.objectId,
            includeDiff: selection.includeDiff
          })
      headRevision = { kind: 'git', objectId: preparedWorkspace.headObjectId }
      commits = preparedWorkspace.commitObjectIds
      if (preparedWorkspace.unifiedDiff) {
        artifacts.push(
          artifact('unified_diff', 'selected-result.diff', preparedWorkspace.unifiedDiff)
        )
      }
    }
    if (selection.includeVerificationOutput) {
      const checks: VerificationResult[] = this.client.listVerifications(selection.runId)
      const output = checks
        .map(
          (check) =>
            `## ${check.commandLabel}\n\n\`${check.command}\`\n\nExit: ${check.exitCode}\n\n\`\`\`text\n${check.output}\n\`\`\``
        )
        .join('\n\n')
      if (output) {
        artifacts.push(artifact('verification_output', 'verification-results.md', output))
      }
    }

    const request: PreparePublicationRequest = {
      agentRunId: selection.runId,
      summaryMarkdown: selection.summaryMarkdown,
      headRevision,
      commitGitObjectIds: commits,
      reviewUrl: selection.reviewUrl ?? null,
      artifacts: artifacts.map(({ content: _content, ...metadata }) => metadata)
    }
    const prepared = await this.client.request<PreparedPublication>('/v1/publications/prepare', {
      method: 'POST',
      body: request
    })
    await Promise.all(
      prepared.uploads.map(async (upload) => {
        const selected = artifacts.find(
          (candidate) => candidate.clientArtifactId === upload.clientArtifactId
        )
        if (!selected) {
          throw new Error('Prepared publication contains an unknown artifact.')
        }
        const response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: upload.requiredHeaders,
          body: selected.content,
          signal: AbortSignal.timeout(60_000)
        })
        if (!response.ok) {
          throw new Error(`Artifact upload failed (${response.status}).`)
        }
      })
    )
    return this.client.request(`/v1/publications/${prepared.publicationId}/finalize`, {
      method: 'POST',
      body: {
        artifactReceipts: artifacts.map((selected) => ({
          clientArtifactId: selected.clientArtifactId,
          sha256: selected.sha256
        }))
      }
    })
  }

  #workspace(selection: PublishSelection) {
    const workspace = this.client.getWorkspaceLink(selection.clientRunId)
    if (!workspace || workspace.agentRunId !== selection.runId || !workspace.baseRevision) {
      throw new Error('TeamRun workspace link is incomplete on this device.')
    }
    const target = resolveTeamRunWorkspaceTarget(this.store, workspace)
    return {
      path: target.path,
      connectionId: target.connectionId,
      workspaceId: workspace.workspaceId,
      runtimeEnvironmentId: target.runtimeEnvironmentId,
      baseRevision: workspace.baseRevision
    }
  }
}
