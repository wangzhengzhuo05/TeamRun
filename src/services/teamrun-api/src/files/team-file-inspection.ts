import { createHash } from 'node:crypto'

const MAX_TEAM_FILE_BYTES = 524_288
const EXECUTABLE_SIGNATURES = [
  Buffer.from([0x4d, 0x5a]),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf])
]
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[opusr]_[A-Za-z0-9_]{32,}\b/,
  /\bsk-[A-Za-z0-9_-]{32,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/
]

export type TeamFileInspection = {
  bytes: Buffer
  sha256: string
  availability: 'available' | 'quarantined'
  quarantineReason: 'executable_content' | 'possible_secret' | null
}

export function inspectTeamFileContent(contentBase64: string): TeamFileInspection {
  if (!/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(contentBase64)) {
    throw new Error('team_file_content_invalid')
  }
  const bytes = Buffer.from(contentBase64, 'base64')
  if (bytes.toString('base64') !== contentBase64) {
    throw new Error('team_file_content_invalid')
  }
  if (bytes.byteLength > MAX_TEAM_FILE_BYTES) {
    throw new Error('team_file_too_large')
  }
  const executable = EXECUTABLE_SIGNATURES.some(
    (signature) => bytes.subarray(0, signature.length).compare(signature) === 0
  )
  const text = bytes.toString('utf8')
  const containsSecret = SECRET_PATTERNS.some((pattern) => pattern.test(text))
  const quarantineReason = executable
    ? 'executable_content'
    : containsSecret
      ? 'possible_secret'
      : null
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    availability: quarantineReason ? 'quarantined' : 'available',
    quarantineReason
  }
}
