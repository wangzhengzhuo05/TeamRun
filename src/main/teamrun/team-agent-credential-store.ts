import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  credentialFileHasContent,
  readStoredCredentialToken,
  writeEncryptedCredential
} from '../integration-credential-file'

function credentialDirectory(): string {
  return join(homedir(), '.orca', 'team-agent-credentials')
}

function credentialPath(agentId: string): string {
  return join(credentialDirectory(), `${Buffer.from(agentId).toString('base64url')}.enc`)
}

export function hasTeamAgentCredential(agentId: string): boolean {
  return credentialFileHasContent(credentialPath(agentId))
}

export function saveTeamAgentCredential(agentId: string, apiKey: string): void {
  const value = apiKey.trim()
  if (value.length < 24) {
    throw new Error('team_agent_api_key_required')
  }
  mkdirSync(credentialDirectory(), { recursive: true, mode: 0o700 })
  writeEncryptedCredential('Team Agent', credentialPath(agentId), value)
}

export function readTeamAgentCredential(agentId: string): string | null {
  const path = credentialPath(agentId)
  if (!existsSync(path)) {
    return null
  }
  return readStoredCredentialToken('Team Agent', readFileSync(path))
}

export function clearTeamAgentCredential(agentId: string): void {
  try {
    unlinkSync(credentialPath(agentId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
