import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  prepareTeamServerDevelopmentWorkspace,
  readTeamServerDevelopmentResult
} from './team-server-development-worktree'

const execFileAsync = promisify(execFile)

describe('Team Server development worktree', () => {
  let root = ''

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates an isolated branch and includes new files in the review diff', async () => {
    root = await mkdtemp(join(tmpdir(), 'teamrun-development-worktree-'))
    const source = join(root, 'source')
    await mkdir(source)
    await git(source, ['init'])
    await git(source, ['config', 'user.name', 'TeamRun Test'])
    await git(source, ['config', 'user.email', 'teamrun@example.test'])
    await writeFile(join(source, 'README.md'), '# Base\n')
    await git(source, ['add', 'README.md'])
    await git(source, ['commit', '-m', 'base'])
    const defaultBranch = await gitOutput(source, ['branch', '--show-current'])
    const runId = '2ea670a8-384a-4be8-8411-bd4d4e280125'
    const workspace = await prepareTeamServerDevelopmentWorkspace({
      root: join(root, 'runtime'),
      runId,
      remoteUrl: source,
      defaultBranch
    })

    expect(workspace.branchName).toBe(`teamrun/${runId}`)
    expect(await gitOutput(workspace.workspacePath, ['rev-parse', 'HEAD'])).toBe(
      workspace.baseObjectId
    )
    await writeFile(join(workspace.workspacePath, 'new-file.ts'), 'export const ready = true\n')
    const result = await readTeamServerDevelopmentResult(
      workspace.workspacePath,
      workspace.baseObjectId
    )

    expect(result.diffPatch).toContain('new-file.ts')
    expect(result.diffPatch).toContain('export const ready = true')
    expect(result.diffTruncated).toBe(false)
  })
})

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}
