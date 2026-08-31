export const TEAM_AGENT_RUNTIME_PROTOCOL_VERSION = 1

export type TeamAgentCredentialMode = 'api-key' | 'local-session'

export type TeamAgentRuntimeDescriptor = {
  chatReply: boolean
  credentialMode: TeamAgentCredentialMode
}

const TEAM_AGENT_RUNTIMES: Readonly<Record<string, TeamAgentRuntimeDescriptor>> = {
  codex: { chatReply: true, credentialMode: 'api-key' },
  claude: { chatReply: true, credentialMode: 'api-key' },
  opencode: { chatReply: true, credentialMode: 'local-session' }
}

export function teamAgentRuntime(agentKind: string): TeamAgentRuntimeDescriptor | null {
  return TEAM_AGENT_RUNTIMES[agentKind] ?? null
}

export function supportsTeamAgentChat(agentKind: string): boolean {
  return teamAgentRuntime(agentKind)?.chatReply === true
}

export function teamAgentRequiresApiKey(agentKind: string): boolean {
  return teamAgentRuntime(agentKind)?.credentialMode === 'api-key'
}
