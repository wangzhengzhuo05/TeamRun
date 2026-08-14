import { createHash } from 'node:crypto'

export function relayHostIdForPublicKey(publicKeyB64: string): string | null {
  try {
    const publicKey = Buffer.from(publicKeyB64, 'base64')
    if (publicKey.byteLength !== 32 || publicKey.toString('base64') !== publicKeyB64) {
      return null
    }
    return createHash('sha256').update(publicKey).digest('base64url').slice(0, 16)
  } catch {
    return null
  }
}
