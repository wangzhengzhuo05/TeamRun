import { z } from 'zod'
import { ApiProblem } from '../http/api-problem.js'

const pairingOfferSchema = z
  .object({
    v: z.literal(2),
    endpoint: z.string().min(1).max(2048),
    deviceToken: z.string().min(1).max(4096),
    publicKeyB64: z.string().min(1).max(64),
    pairedDeviceId: z.string().min(1).max(160).optional(),
    scope: z.enum(['mobile', 'runtime']).optional(),
    relay: z.unknown().optional()
  })
  .superRefine((offer, context) => {
    let endpoint: URL
    try {
      endpoint = new URL(offer.endpoint)
    } catch {
      context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Invalid runtime endpoint' })
      return
    }
    if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Invalid runtime endpoint' })
    }
    if (Buffer.from(offer.publicKeyB64, 'base64').length !== 32) {
      context.addIssue({ code: 'custom', path: ['publicKeyB64'], message: 'Invalid runtime key' })
    }
    if (offer.scope !== 'runtime' || offer.relay !== undefined) {
      context.addIssue({ code: 'custom', path: ['scope'], message: 'Expected runtime access' })
    }
  })

export type TeamServerPairingOffer = z.infer<typeof pairingOfferSchema>

export function parseStoredTeamServerPairing(value: unknown): TeamServerPairingOffer {
  return pairingOfferSchema.parse(value)
}

export function parseTeamServerPairingCode(value: string): TeamServerPairingOffer {
  try {
    const trimmed = value.trim()
    const encoded = trimmed.toLowerCase().startsWith('orca://')
      ? pairingCodeFromUrl(trimmed)
      : trimmed
    if (!encoded || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) {
      throw new Error('invalid_pairing_code')
    }
    const json = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    )
    return parseStoredTeamServerPairing(JSON.parse(json))
  } catch {
    throw new ApiProblem(
      400,
      'team_server_pairing_invalid',
      'Team Server pairing code is invalid or does not grant runtime access'
    )
  }
}

function pairingCodeFromUrl(value: string): string | null {
  const url = new URL(value)
  if (url.protocol !== 'orca:' || url.hostname !== 'pair') {
    return null
  }
  return url.searchParams.get('code') ?? (url.hash ? url.hash.slice(1) : null)
}
