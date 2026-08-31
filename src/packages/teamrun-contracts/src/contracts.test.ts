import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  agentRunStatusSchema,
  createTeamAgentRequestSchema,
  createTaskRequestSchema,
  gitRemoteUrlSchema,
  publicationArtifactSchema,
  preparePublicationRequestSchema,
  requestTeamAgentReplySchema,
  teamRunWorkspaceLinkSchema
} from './index.js'

describe('TeamRun contracts', () => {
  it('accepts every public agent state', () => {
    for (const status of [
      'queued',
      'starting',
      'working',
      'needs_input',
      'review',
      'completed',
      'failed',
      'canceled'
    ]) {
      expect(agentRunStatusSchema.parse(status)).toBe(status)
    }
  })

  it('requires OpenCode and a Model Connection for new Team Agents', () => {
    const modelConnectionId = crypto.randomUUID()
    expect(
      createTeamAgentRequestSchema.safeParse({
        name: 'Internal reviewer',
        agentKind: 'generic-cli',
        launchCommand: 'company-agent --interactive',
        modelConnectionId,
        instructionsMarkdown: ''
      }).success
    ).toBe(false)
    expect(
      createTeamAgentRequestSchema.parse({
        name: 'Internal reviewer',
        agentKind: 'opencode',
        modelConnectionId,
        instructionsMarkdown: ''
      }).modelConnectionId
    ).toBe(modelConnectionId)
  })

  it('accepts only an Agent identity when requesting a server-authored reply', () => {
    const body = { teamAgentId: crypto.randomUUID() }
    expect(requestTeamAgentReplySchema.parse(body)).toEqual(body)
    expect(
      requestTeamAgentReplySchema.safeParse({ ...body, bodyMarkdown: 'forged response' }).success
    ).toBe(false)
  })

  it('keeps imported tasks canonical after the initial snapshot', () => {
    const task = createTaskRequestSchema.parse({
      title: 'Imported issue',
      descriptionMarkdown: 'TeamRun copy',
      externalSource: {
        provider: 'gitlab',
        externalId: 'group/project#14',
        url: 'https://gitlab.example.test/group/project/-/issues/14',
        importedMarkdown: 'Original snapshot'
      }
    })
    expect(task.externalSource?.provider).toBe('gitlab')
  })

  it('rejects artifacts above the publication limit', () => {
    const result = preparePublicationRequestSchema.safeParse({
      agentRunId: crypto.randomUUID(),
      summaryMarkdown: '',
      headRevision: { kind: 'git', objectId: 'a'.repeat(40) },
      commitGitObjectIds: [],
      artifacts: [
        {
          clientArtifactId: 'diff',
          kind: 'unified_diff',
          fileName: 'changes.diff',
          contentType: 'text/x-diff',
          byteSize: 5 * 1024 * 1024 + 1,
          sha256: createHash('sha256').update('diff').digest('hex')
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('validates short-lived published artifact downloads', () => {
    expect(
      publicationArtifactSchema.parse({
        clientArtifactId: 'diff',
        kind: 'unified_diff',
        fileName: 'selected-result.diff',
        contentType: 'text/plain; charset=utf-8',
        byteSize: 4,
        sha256: createHash('sha256').update('diff').digest('hex'),
        downloadUrl: 'https://objects.example.test/signed-result',
        expiresAt: '2026-08-24T00:05:00.000Z'
      }).kind
    ).toBe('unified_diff')
  })

  it('requires versioned workspace links', () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID())
    expect(
      teamRunWorkspaceLinkSchema.parse({
        version: 1,
        organizationId: ids[0],
        projectId: ids[1],
        taskId: ids[2],
        contextSnapshotId: ids[3],
        agentRunId: ids[4]
      }).version
    ).toBe(1)
  })

  it('accepts credential-free HTTPS and SSH Git remotes', () => {
    expect(gitRemoteUrlSchema.parse('https://gitlab.example/team/repo.git')).toContain('gitlab')
    expect(gitRemoteUrlSchema.parse('git@example.test:team/repo.git')).toContain('@')
    expect(gitRemoteUrlSchema.safeParse('https://token@example.test/repo.git').success).toBe(false)
  })
})
