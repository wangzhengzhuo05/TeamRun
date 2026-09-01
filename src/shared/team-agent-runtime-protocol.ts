export const TEAM_AGENT_RUNTIME_PROTOCOL_VERSION = 2

export type TeamAgentRuntimeDescriptor = {
  chatReply: boolean
  execution: 'team-server'
}

const TEAM_AGENT_RUNTIMES: Readonly<Record<string, TeamAgentRuntimeDescriptor>> = {
  opencode: { chatReply: true, execution: 'team-server' }
}

export function teamAgentRuntime(agentKind: string): TeamAgentRuntimeDescriptor | null {
  return TEAM_AGENT_RUNTIMES[agentKind] ?? null
}

export function supportsTeamAgentChat(agentKind: string): boolean {
  return teamAgentRuntime(agentKind)?.chatReply === true
}
