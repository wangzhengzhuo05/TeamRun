import { constants } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  normalizeSshWorkloadProcess,
  prioritizeSshSurvivalProcess
} from './ssh-process-survival-priority'

function dependencies(platform: NodeJS.Platform = 'linux') {
  return {
    platform,
    currentPid: 41,
    readFile: vi.fn(() => 'Name:\tssh\nPPid:\t41\n'),
    setProcessPriority: vi.fn(),
    writeFile: vi.fn()
  }
}

describe('SSH process survival priority', () => {
  it('raises scheduler priority and lowers the Linux OOM score', () => {
    const deps = dependencies()

    expect(prioritizeSshSurvivalProcess(42, deps)).toEqual({
      schedulerAdjusted: true,
      oomScoreAdjusted: true
    })
    expect(deps.setProcessPriority).toHaveBeenCalledWith(
      42,
      constants.priority.PRIORITY_ABOVE_NORMAL
    )
    expect(deps.writeFile).toHaveBeenCalledWith('/proc/42/oom_score_adj', '-300\n')
  })

  it('keeps relay workloads at normal CPU priority and makes them preferred OOM victims', () => {
    const deps = dependencies()

    expect(normalizeSshWorkloadProcess(42, deps)).toEqual({
      schedulerAdjusted: true,
      oomScoreAdjusted: true
    })
    expect(deps.setProcessPriority).toHaveBeenCalledWith(42, constants.priority.PRIORITY_NORMAL)
    expect(deps.writeFile).toHaveBeenCalledWith('/proc/42/oom_score_adj', '300\n')
  })

  it('does not touch an unrelated Linux process', () => {
    const deps = dependencies()
    deps.readFile.mockReturnValue('Name:\tother\nPPid:\t7\n')

    expect(prioritizeSshSurvivalProcess(42, deps)).toEqual({
      schedulerAdjusted: false,
      oomScoreAdjusted: false
    })
    expect(deps.setProcessPriority).not.toHaveBeenCalled()
    expect(deps.writeFile).not.toHaveBeenCalled()
  })

  it('does not treat the relay itself as a child workload', () => {
    const deps = dependencies()

    expect(normalizeSshWorkloadProcess(41, deps)).toEqual({
      schedulerAdjusted: false,
      oomScoreAdjusted: false
    })
    expect(deps.setProcessPriority).not.toHaveBeenCalled()
    expect(deps.writeFile).not.toHaveBeenCalled()
  })

  it('retains scheduler priority on non-Linux platforms without touching procfs', () => {
    const deps = dependencies('win32')

    expect(prioritizeSshSurvivalProcess(42, deps)).toEqual({
      schedulerAdjusted: true,
      oomScoreAdjusted: false
    })
    expect(deps.readFile).not.toHaveBeenCalled()
    expect(deps.writeFile).not.toHaveBeenCalled()
  })

  it('fails open when the operating system rejects either adjustment', () => {
    const deps = dependencies()
    deps.setProcessPriority.mockImplementation(() => {
      throw new Error('permission denied')
    })
    deps.writeFile.mockImplementation(() => {
      throw new Error('permission denied')
    })

    expect(prioritizeSshSurvivalProcess(42, deps)).toEqual({
      schedulerAdjusted: false,
      oomScoreAdjusted: false
    })
  })
})
