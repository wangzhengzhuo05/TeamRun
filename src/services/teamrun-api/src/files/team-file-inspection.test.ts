import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { inspectTeamFileContent } from './team-file-inspection.js'

describe('inspectTeamFileContent', () => {
  it('accepts canonical base64 and records its digest', () => {
    const bytes = Buffer.from('team knowledge', 'utf8')
    const result = inspectTeamFileContent(bytes.toString('base64'))

    expect(result.availability).toBe('available')
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  })

  it('rejects malformed or oversized content', () => {
    expect(() => inspectTeamFileContent('not base64')).toThrow('team_file_content_invalid')
    expect(() => inspectTeamFileContent(Buffer.alloc(524_289).toString('base64'))).toThrow(
      'team_file_too_large'
    )
  })

  it('quarantines executable signatures and likely secrets', () => {
    const executable = inspectTeamFileContent(
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]).toString('base64')
    )
    const secret = inspectTeamFileContent(
      Buffer.from(`token sk-${'a'.repeat(32)}`, 'utf8').toString('base64')
    )

    expect(executable).toMatchObject({
      availability: 'quarantined',
      quarantineReason: 'executable_content'
    })
    expect(secret).toMatchObject({
      availability: 'quarantined',
      quarantineReason: 'possible_secret'
    })
  })
})
