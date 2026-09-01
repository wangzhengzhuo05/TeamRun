function tokenClaim(accessToken: string, name: 'email' | 'sub'): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()
    ) as Record<string, unknown>
    return typeof payload[name] === 'string' ? payload[name] : null
  } catch {
    return null
  }
}

export function teamRunTokenEmail(accessToken: string): string | null {
  return tokenClaim(accessToken, 'email')
}

export function teamRunTokenSubject(accessToken: string): string | null {
  return tokenClaim(accessToken, 'sub')
}
