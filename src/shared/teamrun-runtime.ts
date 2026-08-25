import type { TeamRunVerificationCommand } from './orca-yaml-hook-types'

export type TeamRunRuntimeVerificationResult = {
  command: TeamRunVerificationCommand
  exitCode: number
  durationMs: number
  output: string
}

export type TeamRunRuntimePublicationResult = {
  headObjectId: string
  commitObjectIds: string[]
  hasUncommittedChanges?: boolean
  unifiedDiff?: string
}
