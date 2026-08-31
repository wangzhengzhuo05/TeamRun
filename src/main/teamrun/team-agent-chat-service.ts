import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ChannelMessage, TeamAgent } from '../../shared/teamrun-api'
import {
  supportsTeamAgentChat,
  teamAgentRequiresApiKey
} from '../../shared/team-agent-runtime-protocol'
import type { TeamRunApiClient } from './teamrun-api-client'
import {
  readTeamAgentCredentialConfig,
  type TeamAgentCredential
} from './team-agent-credential-store'

const execFileAsync = promisify(execFile)
const MAX_REPLY_LENGTH = 16_000
const MAX_CONTEXT_LENGTH = 12_000

type AgentReplyExecutor = (
  agent: TeamAgent,
  messages: ChannelMessage[],
  credential: TeamAgentCredential | null
) => Promise<string>
type CredentialReader = (agentId: string) => TeamAgentCredential | null

export class TeamAgentChatService {
  readonly #readCredential: CredentialReader
  readonly #executeReply: AgentReplyExecutor

  constructor(
    private readonly client: TeamRunApiClient,
    dependencies: {
      readCredential?: CredentialReader
      executeReply?: AgentReplyExecutor
    } = {}
  ) {
    this.#readCredential = dependencies.readCredential ?? readTeamAgentCredentialConfig
    this.#executeReply = dependencies.executeReply ?? runTeamAgentReply
  }

  async reply(args: {
    projectId: string
    channelId: string
    teamAgentId: string
    bodyMarkdown: string
  }): Promise<ChannelMessage> {
    const [agents, messages] = await Promise.all([
      this.client.request<TeamAgent[]>(`/v1/projects/${args.projectId}/team-agents`, {
        cache: false
      }),
      this.client.request<ChannelMessage[]>(`/v1/channels/${args.channelId}/messages`, {
        cache: false
      })
    ])
    const agent = agents.find((entry) => entry.id === args.teamAgentId)
    if (!agent) {
      throw new Error('team_agent_not_found')
    }
    const response = await this.#runAgent(agent, messages)
    return this.client.request<ChannelMessage>(`/v1/channels/${args.channelId}/agent-messages`, {
      method: 'POST',
      body: { authorTeamAgentId: agent.id, bodyMarkdown: response },
      queueIfOffline: false
    })
  }

  async #runAgent(agent: TeamAgent, messages: ChannelMessage[]): Promise<string> {
    const requiresApiKey = teamAgentRequiresApiKey(agent.agentKind)
    const credential = this.#readCredential(agent.id)
    if (requiresApiKey && !credential) {
      throw new Error('team_agent_api_key_missing')
    }
    if (!supportsTeamAgentChat(agent.agentKind)) {
      throw new Error('team_agent_chat_unsupported')
    }
    return this.#executeReply(agent, messages, credential)
  }
}

async function runTeamAgentReply(
  agent: TeamAgent,
  messages: ChannelMessage[],
  credential: TeamAgentCredential | null
): Promise<string> {
  if (agent.agentKind === 'codex') {
    return runCodexAgentReply(agent, messages, credential!)
  }
  if (agent.agentKind === 'claude') {
    return runClaudeAgentReply(agent, messages, credential!)
  }
  return runOpenCodeAgentReply(agent, messages, credential)
}

function chatPrompt(agent: TeamAgent, messages: ChannelMessage[]): string {
  return [
    `You are ${agent.name}, a TeamRun team chat agent.`,
    agent.instructionsMarkdown.trim(),
    'Reply naturally to the current channel conversation. Do not mention this execution wrapper.',
    `Recent conversation:\n${formatConversation(messages)}`
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function runCodexAgentReply(
  agent: TeamAgent,
  messages: ChannelMessage[],
  credential: TeamAgentCredential
): Promise<string> {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'teamrun-agent-reply-'))
  const outputPath = join(outputDirectory, 'reply.md')
  const prompt = chatPrompt(agent, messages)
  try {
    await execFileAsync(
      'codex',
      [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--output-last-message',
        outputPath,
        prompt
      ],
      {
        env: {
          ...process.env,
          OPENAI_API_KEY: credential.apiKey,
          ...(credential.baseUrl ? { OPENAI_BASE_URL: credential.baseUrl } : {})
        },
        timeout: 120_000,
        maxBuffer: MAX_REPLY_LENGTH * 2
      }
    )
    const response = (await readFile(outputPath, 'utf8')).trim()
    if (!response) {
      throw new Error('team_agent_empty_reply')
    }
    return response.slice(0, MAX_REPLY_LENGTH)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
}

async function runClaudeAgentReply(
  agent: TeamAgent,
  messages: ChannelMessage[],
  credential: TeamAgentCredential
): Promise<string> {
  const { stdout } = await execFileAsync(
    'claude',
    [
      '-p',
      '--output-format',
      'text',
      '--max-turns',
      '1',
      '--permission-mode',
      'plan',
      chatPrompt(agent, messages)
    ],
    {
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: credential.apiKey,
        ...(credential.baseUrl ? { ANTHROPIC_BASE_URL: credential.baseUrl } : {})
      },
      timeout: 120_000,
      maxBuffer: MAX_REPLY_LENGTH * 2
    }
  )
  return readReply(stdout)
}

async function runOpenCodeAgentReply(
  agent: TeamAgent,
  messages: ChannelMessage[],
  credential: TeamAgentCredential | null
): Promise<string> {
  const { stdout } = await execFileAsync('opencode', ['run', chatPrompt(agent, messages)], {
    env: {
      ...process.env,
      ...(credential ? { OPENAI_API_KEY: credential.apiKey } : {}),
      ...(credential?.baseUrl ? { OPENAI_BASE_URL: credential.baseUrl } : {})
    },
    timeout: 120_000,
    maxBuffer: MAX_REPLY_LENGTH * 2
  })
  return readReply(stdout)
}

function readReply(value: string): string {
  const response = value.trim()
  if (!response) {
    throw new Error('team_agent_empty_reply')
  }
  return response.slice(0, MAX_REPLY_LENGTH)
}

function formatConversation(messages: ChannelMessage[]): string {
  const conversation = messages
    .slice(-20)
    .map(
      (message) => `${message.authorTeamAgentId ? 'Agent' : 'Team member'}: ${message.bodyMarkdown}`
    )
    .join('\n\n')
  return conversation.slice(-MAX_CONTEXT_LENGTH)
}
