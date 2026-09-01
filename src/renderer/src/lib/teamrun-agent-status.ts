import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { AgentRun } from '../../../shared/teamrun-api'

export function teamRunStatusFromAgent(
  entry: AgentStatusEntry
): Extract<AgentRun['status'], 'working' | 'needs_input' | 'review'> | null {
  if (entry.restoredUnconfirmed || (entry.state === 'done' && entry.sessionBoundary)) {
    return null
  }
  if (entry.state === 'working') {
    return 'working'
  }
  if (entry.state === 'blocked' || entry.state === 'waiting') {
    return 'needs_input'
  }
  return entry.state === 'done' ? 'review' : null
}
