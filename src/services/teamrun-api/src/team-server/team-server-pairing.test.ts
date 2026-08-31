import { describe, expect, it } from 'vitest'
import { parseTeamServerPairingCode } from './team-server-pairing.js'

function pairingCode(scope: 'mobile' | 'runtime'): string {
  return Buffer.from(
    JSON.stringify({
      v: 2,
      endpoint: 'wss://runtime.example.test/control',
      deviceToken: 'runtime-token',
      publicKeyB64: Buffer.alloc(32, 7).toString('base64'),
      pairedDeviceId: 'device-1',
      scope
    })
  ).toString('base64url')
}

describe('parseTeamServerPairingCode', () => {
  it('accepts runtime access links', () => {
    const parsed = parseTeamServerPairingCode(`orca://pair?code=${pairingCode('runtime')}`)
    expect(parsed).toMatchObject({ scope: 'runtime', pairedDeviceId: 'device-1' })
  })

  it('rejects mobile-only access', () => {
    expect(() => parseTeamServerPairingCode(pairingCode('mobile'))).toThrow(
      'does not grant runtime access'
    )
  })
})
