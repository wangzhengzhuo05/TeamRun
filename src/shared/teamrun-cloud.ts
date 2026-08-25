export type TeamRunAuthStatus =
  | {
      state: 'signed-out' | 'unconfigured'
      apiUrl: string
      devAuth: boolean
    }
  | {
      state: 'signed-in'
      apiUrl: string
      devAuth: boolean
      email: string | null
    }
  | {
      state: 'error'
      apiUrl: string
      devAuth: boolean
      message: string
    }

export type TeamRunSignInArgs = { devEmail?: string }

export type TeamRunSyncStatus = {
  connection: 'connecting' | 'online' | 'offline' | 'blocked'
  pendingMutations: number
  cursor?: number
  message?: string
}

export type TeamRunWorkspaceRecord = {
  clientRunId: string
  agentRunId: string
  workspaceId: string
  workspacePath: string
  taskId?: string
  baseRevision?: import('./teamrun-api').WorkspaceRevision
  createdAt: number
}

export type TeamRunWorkspaceReview = {
  baseRevision: import('./teamrun-api').WorkspaceRevision
  headRevision: import('./teamrun-api').WorkspaceRevision
  commitGitObjectIds: string[]
  hasUncommittedChanges: boolean
  unifiedDiff: string
}

export type TeamRunApiError = {
  code: string
  message: string
  requestId?: string
  status: number
}
