const MAX_CONTEXT_BYTES = 128_000

export function requireTeamServerDevelopmentInput(args: {
  agent: { yoloMode: boolean }
  task: { frozenContextMarkdown: string }
}): void {
  if (!args.agent.yoloMode) {
    throw new Error('team_server_development_run_requires_yolo')
  }
  if (Buffer.byteLength(args.task.frozenContextMarkdown, 'utf8') > MAX_CONTEXT_BYTES) {
    throw new Error('team_server_development_context_too_large')
  }
}

export function teamServerDevelopmentFailureCode(error: unknown): string {
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return 'team_server_opencode_missing'
  }
  const message = error instanceof Error ? error.message : ''
  return /^team_server_[a-z0-9_]+$/.test(message) ? message : 'team_server_development_run_failed'
}

export function requireLinuxTeamServer(): void {
  if (process.platform !== 'linux') {
    throw new Error('team_server_linux_required')
  }
}
