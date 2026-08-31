import { join } from 'node:path'
import type { TeamServerModelConnectionSecret } from './team-server-model-connection-store'

export function teamServerOpenCodeEnvironment(
  directory: string,
  connection: TeamServerModelConnectionSecret
): NodeJS.ProcessEnv {
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
    TEAMRUN_MODEL_API_KEY: connection.apiKey,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      permission: 'deny',
      provider: {
        teamrun: {
          npm: '@ai-sdk/openai-compatible',
          name: 'TeamRun Model Connection',
          options: {
            baseURL: connection.baseUrl,
            apiKey: '{env:TEAMRUN_MODEL_API_KEY}'
          },
          models: { [connection.model]: { name: connection.model } }
        }
      }
    })
  }
}

function copyEnvironment(names: string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(
    names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
  )
}
