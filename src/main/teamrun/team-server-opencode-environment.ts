import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TeamServerModelConnectionSecret } from './team-server-model-connection-store'

export function teamServerOpenCodeEnvironment(
  directory: string,
  connection: TeamServerModelConnectionSecret,
  profile: 'documentation' | 'development-yolo' = 'documentation'
): NodeJS.ProcessEnv {
  const apiKeyPath = join(directory, '.teamrun-model-api-key')
  const inherited = copyEnvironment([
    'PATH',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'NODE_EXTRA_CA_CERTS'
  ])
  return {
    ...inherited,
    HOME: directory,
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_DATA_HOME: join(directory, 'data'),
    XDG_CACHE_HOME: join(directory, 'cache'),
    OPENCODE_CONFIG_DIR: join(directory, 'opencode'),
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      permission: profile === 'documentation' ? 'deny' : developmentPermissions(),
      provider: {
        teamrun: {
          npm: '@ai-sdk/openai-compatible',
          name: 'TeamRun Model Connection',
          options: {
            baseURL: connection.baseUrl,
            apiKey: `{file:${apiKeyPath}}`
          },
          models: { [connection.model]: { name: connection.model } }
        }
      }
    })
  }
}

export async function prepareTeamServerOpenCodeEnvironment(
  directory: string,
  connection: TeamServerModelConnectionSecret,
  profile: 'documentation' | 'development-yolo' = 'documentation'
): Promise<NodeJS.ProcessEnv> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const apiKeyPath = join(directory, '.teamrun-model-api-key')
  await writeFile(apiKeyPath, connection.apiKey, { encoding: 'utf8', mode: 0o600 })
  await chmod(apiKeyPath, 0o600)
  return teamServerOpenCodeEnvironment(directory, connection, profile)
}

export async function removeTeamServerOpenCodeKey(directory: string): Promise<void> {
  await rm(join(directory, '.teamrun-model-api-key'), { force: true })
}

function developmentPermissions() {
  return {
    '*': 'allow',
    read: {
      '*': 'allow',
      '.env': 'deny',
      '.env.*': 'deny',
      '*.env': 'deny',
      '*.env.*': 'deny',
      '**/.env': 'deny',
      '**/.env.*': 'deny',
      '*.env.example': 'allow'
    },
    bash: {
      '*': 'allow',
      'git push': 'deny',
      'git push *': 'deny',
      '*git push*': 'deny',
      '*git* push*': 'deny'
    },
    external_directory: 'deny',
    question: 'deny'
  }
}

function copyEnvironment(names: string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(
    names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
  )
}
