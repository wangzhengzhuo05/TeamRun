import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TeamRunServiceConfig } from '../service-config.js'
import { decryptTeamServerPairing, encryptTeamServerPairing } from './team-server-pairing-cipher.js'
import type { TeamServerPairingOffer } from './team-server-pairing.js'

describe('Team Server pairing encryption', () => {
  it('round-trips pairing credentials without plaintext storage', () => {
    const config = {
      TEAMRUN_RUNTIME_ENCRYPTION_KEY: randomBytes(32).toString('base64')
    } as TeamRunServiceConfig
    const pairing: TeamServerPairingOffer = {
      v: 2,
      endpoint: 'wss://runtime.example.test/control',
      deviceToken: 'private-device-token',
      publicKeyB64: Buffer.alloc(32, 2).toString('base64'),
      scope: 'runtime'
    }
    const encrypted = encryptTeamServerPairing(config, pairing)

    expect(encrypted).not.toContain(pairing.deviceToken)
    expect(decryptTeamServerPairing(config, encrypted)).toEqual(pairing)
  })
})
