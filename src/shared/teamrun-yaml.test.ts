import { describe, expect, it } from 'vitest'
import { mergeTeamRunProjectConfig, parseTeamRunYaml } from './teamrun-yaml'

describe('teamrun.yaml', () => {
  it('parses trusted verification commands', () => {
    expect(
      parseTeamRunYaml(`
scripts:
  verify:
    - id: unit
      label: Unit tests
      command: pnpm test
`)
    ).toEqual({
      scripts: { verify: [{ id: 'unit', label: 'Unit tests', command: 'pnpm test' }] }
    })
  })

  it('drops duplicate and invalid verification ids', () => {
    const parsed = parseTeamRunYaml(`
scripts:
  verify:
    - { id: unit, label: First, command: pnpm test }
    - { id: unit, label: Duplicate, command: pnpm test }
    - { id: "../escape", label: Invalid, command: echo no }
`)
    expect(parsed?.scripts.verify).toEqual([{ id: 'unit', label: 'First', command: 'pnpm test' }])
  })

  it('prefers TeamRun fields and falls back field-by-field to Orca', () => {
    const merged = mergeTeamRunProjectConfig(
      parseTeamRunYaml('scripts:\n  archive: teamrun-clean\n'),
      parseTeamRunYaml('scripts:\n  setup: pnpm install\n  archive: orca-clean\n')
    )
    expect(merged?.scripts).toMatchObject({ setup: 'pnpm install', archive: 'teamrun-clean' })
  })
})
