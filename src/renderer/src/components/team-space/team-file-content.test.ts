import { describe, expect, it } from 'vitest'
import { inferTeamFileKind, inferTeamFileMimeType, supportsTeamFileText } from './team-file-content'

describe('Team File content metadata', () => {
  it('recognizes text formats that can enter frozen context', () => {
    expect(supportsTeamFileText('text/markdown')).toBe(true)
    expect(supportsTeamFileText('application/json')).toBe(true)
    expect(supportsTeamFileText('application/octet-stream')).toBe(false)
  })

  it('infers document, code, and binary file roles', () => {
    expect(inferTeamFileKind('docs/plan.md', '')).toBe('document')
    expect(inferTeamFileKind('src/main.ts', 'text/plain')).toBe('code')
    expect(inferTeamFileKind('assets/logo.png', 'image/png')).toBe('file')
    expect(inferTeamFileMimeType('docs/plan.md', '')).toBe('text/markdown')
    expect(inferTeamFileMimeType('src/main.ts', '')).toBe('text/plain')
  })
})
