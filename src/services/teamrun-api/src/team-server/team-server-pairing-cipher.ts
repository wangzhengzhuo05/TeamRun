import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ApiProblem } from '../http/api-problem.js'
import type { TeamRunServiceConfig } from '../service-config.js'
import { parseStoredTeamServerPairing, type TeamServerPairingOffer } from './team-server-pairing.js'

const FORMAT_VERSION = 'v1'

export function encryptTeamServerPairing(
  config: TeamRunServiceConfig,
  pairing: TeamServerPairingOffer
): string {
  const key = encryptionKey(config)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(pairing), 'utf8'), cipher.final()])
  return [FORMAT_VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

export function decryptTeamServerPairing(
  config: TeamRunServiceConfig,
  encrypted: string
): TeamServerPairingOffer {
  try {
    const [version, ivValue, tagValue, ciphertextValue] = encrypted.split('.')
    if (version !== FORMAT_VERSION || !ivValue || !tagValue || !ciphertextValue) {
      throw new Error('invalid_pairing_ciphertext')
    }
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(config), decode(ivValue))
    decipher.setAuthTag(decode(tagValue))
    return parseStoredTeamServerPairing(
      JSON.parse(
        Buffer.concat([decipher.update(decode(ciphertextValue)), decipher.final()]).toString('utf8')
      )
    )
  } catch (error) {
    if (error instanceof ApiProblem) {
      throw error
    }
    throw new ApiProblem(
      503,
      'team_server_credential_unavailable',
      'Team Server credentials could not be decrypted'
    )
  }
}

function encryptionKey(config: TeamRunServiceConfig): Buffer {
  if (!config.TEAMRUN_RUNTIME_ENCRYPTION_KEY) {
    throw new ApiProblem(
      503,
      'team_server_encryption_unavailable',
      'Team Server encryption is not configured'
    )
  }
  return Buffer.from(config.TEAMRUN_RUNTIME_ENCRYPTION_KEY, 'base64')
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}
