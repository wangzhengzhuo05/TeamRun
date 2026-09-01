import { parseExecutionHostId } from '../../shared/execution-host'
import { TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import type { Repo } from '../../shared/repo-types'
import {
  callRuntimeEnvironment,
  getRuntimeEnvironmentStatus
} from '../ipc/runtime-environment-transport-routing'

const UPDATE_REQUIRED_MESSAGE =
  'This remote runtime must be updated before it can use TeamRun workspace operations.'

export function getTeamRunRuntimeEnvironmentId(repo: Pick<Repo, 'executionHostId'>): string | null {
  const host = parseExecutionHostId(repo.executionHostId)
  return host?.kind === 'runtime' ? host.environmentId : null
}

export async function callTeamRunRuntime<T>(args: {
  userDataPath: string
  environmentId: string
  method: string
  params: unknown
  timeoutMs?: number
}): Promise<T> {
  const status = await getRuntimeEnvironmentStatus(
    args.userDataPath,
    args.environmentId,
    args.timeoutMs
  )
  if (!status.ok) {
    throw new Error(status.error.message)
  }
  if (!status.result.capabilities?.includes(TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY)) {
    throw new Error(UPDATE_REQUIRED_MESSAGE)
  }
  const response = await callRuntimeEnvironment(
    args.userDataPath,
    args.environmentId,
    args.method,
    args.params,
    args.timeoutMs
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result as T
}
