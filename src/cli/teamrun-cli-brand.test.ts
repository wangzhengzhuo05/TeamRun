import { afterEach, describe, expect, it } from 'vitest'
import { brandTeamRunCliText } from './teamrun-cli-brand'

const originalCommand = process.env.TEAMRUN_CLI_COMMAND

afterEach(() => {
  if (originalCommand === undefined) {
    delete process.env.TEAMRUN_CLI_COMMAND
  } else {
    process.env.TEAMRUN_CLI_COMMAND = originalCommand
  }
})

describe('TeamRun CLI branding', () => {
  it('brands public commands without changing compatibility protocol and environment names', () => {
    process.env.TEAMRUN_CLI_COMMAND = 'teamrun'

    expect(
      brandTeamRunCliText(
        'Orca\nUsage: orca status\nEdit an Orca task in name:orca at /opt/orca/worktree\nPair: orca://pair\nORCA_PAIRING_CODE'
      )
    ).toBe(
      'TeamRun\nUsage: teamrun status\nEdit a TeamRun task in name:teamrun at /opt/teamrun/worktree\nPair: orca://pair\nORCA_PAIRING_CODE'
    )
  })

  it('preserves the compatibility CLI identity by default', () => {
    delete process.env.TEAMRUN_CLI_COMMAND
    expect(brandTeamRunCliText('Orca: orca status')).toBe('Orca: orca status')
  })
})
