import { lstat, readFile, readlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { TeamRunRuntimePublicationResult } from '../../shared/teamrun-runtime'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'

export const TEAMRUN_DIFF_MAX_BYTES = 5 * 1024 * 1024
const MAX_UNTRACKED_FILES = 1_000

type Git = (args: string[]) => Promise<{ stdout: string }>
type WorkspaceFile = { content: string; isBinary: boolean; mode: '100644' | '120000' }

export async function collectTeamRunGitResult(args: {
  git: Git
  workspacePath: string
  connectionId: string | null
  baseObjectId: string
  includeDiff: boolean
  readWorkspaceFile?: (relativePath: string) => Promise<WorkspaceFile>
}): Promise<TeamRunRuntimePublicationResult> {
  const headObjectId = (await args.git(['rev-parse', 'HEAD'])).stdout.trim()
  const [commits, status] = await Promise.all([
    args.git(['rev-list', '--reverse', `${args.baseObjectId}..${headObjectId}`]),
    args.git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  ])
  const commitObjectIds = commits.stdout.split(/\r?\n/).filter(Boolean)
  const hasUncommittedChanges = status.stdout.length > 0
  if (!args.includeDiff) {
    return { headObjectId, commitObjectIds, hasUncommittedChanges }
  }

  const [tracked, untracked] = await Promise.all([
    args.git(['diff', '--no-ext-diff', '--find-renames', '--binary', args.baseObjectId, '--']),
    args.git(['ls-files', '--others', '--exclude-standard', '-z'])
  ])
  const paths = untracked.stdout.split('\0').filter(Boolean)
  if (paths.length > MAX_UNTRACKED_FILES) {
    throw new Error(`Workspace has more than ${MAX_UNTRACKED_FILES} untracked files to review.`)
  }
  const read =
    args.readWorkspaceFile ??
    ((relativePath: string) =>
      readWorkspaceFile(args.workspacePath, args.connectionId, relativePath))
  let unifiedDiff = tracked.stdout
  for (const relativePath of paths) {
    assertGitRelativePath(relativePath)
    const next = renderUntrackedPatch(relativePath, await read(relativePath))
    unifiedDiff = appendPatch(unifiedDiff, next)
    assertDiffSize(unifiedDiff)
  }
  assertDiffSize(unifiedDiff)
  return { headObjectId, commitObjectIds, hasUncommittedChanges, unifiedDiff }
}

async function readWorkspaceFile(
  workspacePath: string,
  connectionId: string | null,
  relativePath: string
): Promise<WorkspaceFile> {
  const filePath = join(workspacePath, ...relativePath.split('/'))
  if (connectionId) {
    const provider = getSshFilesystemProvider(connectionId)
    if (!provider) throw new Error('TeamRun SSH workspace is not connected.')
    const stats = await provider.lstat?.(filePath)
    if (!stats) throw new Error('The SSH host cannot safely inspect untracked files.')
    if (stats.type === 'symlink') {
      return { content: '', isBinary: true, mode: '120000' }
    }
    if (stats.type !== 'file') throw new Error(`Unsupported untracked path: ${relativePath}`)
    if (stats.size > TEAMRUN_DIFF_MAX_BYTES)
      throw new Error(`${relativePath} exceeds the 5 MiB limit.`)
    const result = await provider.readFile(filePath)
    return { content: result.content, isBinary: result.isBinary, mode: '100644' }
  }
  const stats = await lstat(filePath)
  if (stats.isSymbolicLink()) {
    return { content: await readlink(filePath), isBinary: false, mode: '120000' }
  }
  if (!stats.isFile()) throw new Error(`Unsupported untracked path: ${relativePath}`)
  if (stats.size > TEAMRUN_DIFF_MAX_BYTES)
    throw new Error(`${relativePath} exceeds the 5 MiB limit.`)
  const content = await readFile(filePath)
  return {
    content: content.toString('utf8'),
    isBinary: content.subarray(0, 8192).includes(0),
    mode: '100644'
  }
}

function renderUntrackedPatch(path: string, file: WorkspaceFile): string {
  const left = quoteDiffPath(`a/${path}`)
  const right = quoteDiffPath(`b/${path}`)
  const header = `diff --git ${left} ${right}\nnew file mode ${file.mode}\n`
  if (file.isBinary) return `${header}Binary files /dev/null and ${right} differ\n`
  if (!file.content) return header
  const endsWithNewline = file.content.endsWith('\n')
  const lines = file.content.replace(/\n$/, '').split('\n')
  const body = lines.map((line) => `+${line}`).join('\n')
  return `${header}--- /dev/null\n+++ ${right}\n@@ -0,0 +1,${lines.length} @@\n${body}\n${
    endsWithNewline ? '' : '\\ No newline at end of file\n'
  }`
}

function quoteDiffPath(path: string): string {
  return /^[A-Za-z0-9_./@%+=:,~-]+$/.test(path) ? path : JSON.stringify(path)
}

function appendPatch(current: string, next: string): string {
  if (!current) return next
  return `${current}${current.endsWith('\n') ? '' : '\n'}${next}`
}

function assertGitRelativePath(path: string): void {
  if (isAbsolute(path) || path.split('/').some((segment) => segment === '..')) {
    throw new Error('Git returned an unsafe untracked path.')
  }
}

function assertDiffSize(diff: string): void {
  if (Buffer.byteLength(diff) > TEAMRUN_DIFF_MAX_BYTES) {
    throw new Error('Workspace diff exceeds the 5 MiB review limit.')
  }
}
