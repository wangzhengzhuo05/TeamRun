import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))

vi.mock('sonner', () => ({ toast }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { isTeamRunMutationQueued, reportTeamRunMutation } from './teamrun-mutation-feedback'

describe('TeamRun mutation feedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognizes queued mutations after Electron serializes the error', () => {
    expect(
      isTeamRunMutationQueued(
        Object.assign(new Error('queued'), { code: 'teamrun_mutation_queued' })
      )
    ).toBe(true)
    expect(
      isTeamRunMutationQueued(
        new Error(
          'Error invoking remote method: Error: Saved offline. TeamRun will sync this change.'
        )
      )
    ).toBe(true)
  })

  it('uses informational feedback only for accepted offline writes', () => {
    expect(reportTeamRunMutation(new Error('Saved for later. Resolve sync.'), 'failed')).toBe(true)
    expect(toast.info).toHaveBeenCalledWith('Saved locally and queued for sync.')

    expect(reportTeamRunMutation(new Error('Conflict'), 'failed')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Conflict')
  })
})
