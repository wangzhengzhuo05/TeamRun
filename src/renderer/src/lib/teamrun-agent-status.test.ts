import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { teamRunStatusFromAgent } from './teamrun-agent-status'

function entry(changes: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    paneKey: 'tab:leaf',
    stateHistory: [],
    ...changes
  }
}

describe('TeamRun agent status projection', () => {
  it('publishes only coarse lifecycle states', () => {
    expect(teamRunStatusFromAgent(entry({ state: 'working' }))).toBe('working')
    expect(teamRunStatusFromAgent(entry({ state: 'blocked' }))).toBe('needs_input')
    expect(teamRunStatusFromAgent(entry({ state: 'waiting' }))).toBe('needs_input')
    expect(teamRunStatusFromAgent(entry({ state: 'done' }))).toBe('review')
  })

  it('ignores restored and session-boundary snapshots', () => {
    expect(teamRunStatusFromAgent(entry({ restoredUnconfirmed: true }))).toBeNull()
    expect(teamRunStatusFromAgent(entry({ state: 'done', sessionBoundary: true }))).toBeNull()
  })
})
