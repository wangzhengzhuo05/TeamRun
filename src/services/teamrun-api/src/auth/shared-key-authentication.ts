import { createHash, timingSafeEqual } from 'node:crypto'
import type { TeamRunServiceConfig } from '../service-config.js'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function matchesTeamRunSharedKey(candidate: string, configured: string): boolean {
  return timingSafeEqual(digest(candidate), digest(configured))
}

export function teamRunSharedKeyIdentity(config: TeamRunServiceConfig): {
  subject: string
  email: string
  displayName: string
} {
  const email = config.TEAMRUN_SHARED_KEY_EMAIL.toLowerCase()
  return {
    subject: `shared-key:${email}`,
    email,
    displayName: config.TEAMRUN_SHARED_KEY_DISPLAY_NAME
  }
}
