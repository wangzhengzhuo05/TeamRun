import { createHash, randomBytes } from 'node:crypto'

const CODE_BYTES = 16
const CODE_PREFIX = 'TR'

function formatCode(hex: string): string {
  return `${CODE_PREFIX}-${hex.match(/.{1,4}/g)?.join('-') ?? hex}`
}

export function createTeamInviteCode(): { code: string; codeHash: string; codeHint: string } {
  const hex = randomBytes(CODE_BYTES).toString('hex').toUpperCase()
  const normalized = `${CODE_PREFIX}${hex}`
  return {
    code: formatCode(hex),
    codeHash: hashTeamInviteCode(normalized),
    codeHint: hex.slice(-4)
  }
}

export function normalizeTeamInviteCode(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, '')
  return /^TR[0-9A-F]{32}$/.test(normalized) ? normalized : null
}

export function hashTeamInviteCode(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function teamInviteCodeStatus(input: {
  redeemedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}): 'active' | 'redeemed' | 'revoked' | 'expired' {
  if (input.redeemedAt) {
    return 'redeemed'
  }
  if (input.revokedAt) {
    return 'revoked'
  }
  return input.expiresAt.getTime() <= Date.now() ? 'expired' : 'active'
}
