import { describe, expect, it, vi } from 'vitest'
import { collectTeamRunGitResult } from './teamrun-git-result'

const BASE = '1'.repeat(40)
const HEAD = '2'.repeat(40)

function gitResult(overrides: Partial<Record<string, string>> = {}) {
  return vi.fn(async (args: string[]) => {
    const stdout =
      overrides[args[0]] ??
      ({
        'rev-parse': `${HEAD}\n`,
        'rev-list': `3${'0'.repeat(39)}\n`,
        status: ' M tracked.ts\0?? new file.ts\0',
        diff: 'diff --git a/tracked.ts b/tracked.ts\n',
        'ls-files': 'new file.ts\0'
      }[args[0]] as string)
    return { stdout }
  })
}

describe('collectTeamRunGitResult', () => {
  it('combines base-to-working-tree changes with untracked file patches', async () => {
    const git = gitResult()
    const result = await collectTeamRunGitResult({
      git,
      workspacePath: '/workspace',
      connectionId: null,
      baseObjectId: BASE,
      includeDiff: true,
      readWorkspaceFile: vi.fn(async () => ({
        content: 'first\nsecond',
        isBinary: false,
        mode: '100644' as const
      }))
    })

    expect(result).toMatchObject({
      headObjectId: HEAD,
      hasUncommittedChanges: true,
      commitObjectIds: [`3${'0'.repeat(39)}`]
    })
    expect(result.unifiedDiff).toContain('diff --git a/tracked.ts b/tracked.ts')
    expect(result.unifiedDiff).toContain('diff --git "a/new file.ts" "b/new file.ts"')
    expect(result.unifiedDiff).toContain('+first\n+second\n\\ No newline at end of file')
    expect(git).toHaveBeenCalledWith([
      'diff',
      '--no-ext-diff',
      '--find-renames',
      '--binary',
      BASE,
      '--'
    ])
  })

  it('does not read file content when diff publication is not selected', async () => {
    const git = gitResult({ status: '' })
    const readWorkspaceFile = vi.fn()
    const result = await collectTeamRunGitResult({
      git,
      workspacePath: '/workspace',
      connectionId: null,
      baseObjectId: BASE,
      includeDiff: false,
      readWorkspaceFile
    })

    expect(result.hasUncommittedChanges).toBe(false)
    expect(result.unifiedDiff).toBeUndefined()
    expect(readWorkspaceFile).not.toHaveBeenCalled()
  })

  it('rejects an untracked path that escapes the workspace', async () => {
    const git = gitResult({ 'ls-files': '../secret\0' })
    await expect(
      collectTeamRunGitResult({
        git,
        workspacePath: '/workspace',
        connectionId: null,
        baseObjectId: BASE,
        includeDiff: true,
        readWorkspaceFile: vi.fn()
      })
    ).rejects.toThrow('unsafe untracked path')
  })
})
