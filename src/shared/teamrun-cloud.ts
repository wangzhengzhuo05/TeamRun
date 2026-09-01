export type TeamRunAuthStatus =
  | {
      state: 'signed-out' | 'unconfigured'
      apiUrl: string
      devAuth: boolean
      sharedKeyAuth: boolean
    }
  | {
      state: 'signed-in'
      apiUrl: string
      devAuth: boolean
      sharedKeyAuth: boolean
      email: string | null
      userId?: string | null
    }
  | {
      state: 'error'
      apiUrl: string
      devAuth: boolean
      sharedKeyAuth: boolean
      message: string
    }

export type TeamRunSignInArgs = {
  apiUrl?: string
  sharedKey?: string
  devEmail?: string
}

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
  baseRevision?: WorkspaceRevision
  createdAt: number
}

export type TeamRunWorkspaceReview = {
  baseRevision: WorkspaceRevision
  headRevision: WorkspaceRevision
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
import type { WorkspaceRevision } from './teamrun-api'
