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

export type TeamAgentCredential = { apiKey: string; baseUrl: string | null }

export function hasTeamAgentCredential(agentId: string): boolean {
  return credentialFileHasContent(credentialPath(agentId))
}

export function saveTeamAgentCredential(
  agentId: string,
  apiKey: string,
  baseUrl?: string | null
): void {
  const value = apiKey.trim()
  if (value.length < 24) {
    throw new Error('team_agent_api_key_required')
  }
  mkdirSync(credentialDirectory(), { recursive: true, mode: 0o700 })
  writeEncryptedCredential(
    'Team Agent',
    credentialPath(agentId),
    JSON.stringify({ apiKey: value, baseUrl: normalizeBaseUrl(baseUrl) })
  )
}

export function readTeamAgentCredential(agentId: string): string | null {
  return readTeamAgentCredentialConfig(agentId)?.apiKey ?? null
}

export function readTeamAgentCredentialConfig(agentId: string): TeamAgentCredential | null {
  const path = credentialPath(agentId)
  if (!existsSync(path)) {
    return null
  }
  const value = readStoredCredentialToken('Team Agent', readFileSync(path))
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<TeamAgentCredential>
    if (typeof parsed.apiKey === 'string') {
      return { apiKey: parsed.apiKey, baseUrl: normalizeBaseUrl(parsed.baseUrl) }
    }
  } catch {
    // Legacy credentials contained only the API key.
  }
  return { apiKey: value, baseUrl: null }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  const url = new URL(trimmed)
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('team_agent_base_url_invalid')
  }
  return url.toString().replace(/\/$/, '')
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
