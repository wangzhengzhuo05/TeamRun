import { readFileSync, writeFileSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'

// Why: ±300 separates connection infrastructure from workloads without making either OOM-immune.
const SSH_OOM_SCORE_ADJUSTMENT = -300
const SSH_WORKLOAD_OOM_SCORE_ADJUSTMENT = 300

type ProcessPriorityDependencies = {
  platform: NodeJS.Platform
  currentPid: number
  readFile: (path: string) => string
  setProcessPriority: (pid: number, priority: number) => void
  writeFile: (path: string, value: string) => void
}

export type ProcessPriorityResult = {
  schedulerAdjusted: boolean
  oomScoreAdjusted: boolean
}

const defaultDependencies: ProcessPriorityDependencies = {
  platform: process.platform,
  currentPid: process.pid,
  readFile: (path) => readFileSync(path, 'utf8'),
  setProcessPriority: setPriority,
  writeFile: (path, value) => writeFileSync(path, value, 'utf8')
}

function isValidPid(pid: number): boolean {
  return Number.isSafeInteger(pid) && pid > 0
}

function linuxProcPath(pid: number, file: string): string {
  return join('/proc', String(pid), file)
}

function isAdjustableProcess(pid: number, deps: ProcessPriorityDependencies): boolean {
  if (pid === deps.currentPid || deps.platform !== 'linux') {
    return true
  }
  try {
    const status = deps.readFile(linuxProcPath(pid, 'status'))
    return new RegExp(`^PPid:\\s+${deps.currentPid}$`, 'm').test(status)
  } catch {
    return false
  }
}

function setLinuxOomScore(
  pid: number,
  adjustment: number,
  deps: ProcessPriorityDependencies
): boolean {
  if (deps.platform !== 'linux') {
    return false
  }
  try {
    deps.writeFile(linuxProcPath(pid, 'oom_score_adj'), `${adjustment}\n`)
    return true
  } catch {
    return false
  }
}

function setSchedulerPriority(
  pid: number,
  priority: number,
  deps: ProcessPriorityDependencies
): boolean {
  try {
    deps.setProcessPriority(pid, priority)
    return true
  } catch {
    return false
  }
}

export function prioritizeSshSurvivalProcess(
  pid: number | undefined,
  deps: ProcessPriorityDependencies = defaultDependencies
): ProcessPriorityResult {
  if (pid === undefined || !isValidPid(pid) || !isAdjustableProcess(pid, deps)) {
    return { schedulerAdjusted: false, oomScoreAdjusted: false }
  }
  return {
    schedulerAdjusted: setSchedulerPriority(pid, constants.priority.PRIORITY_ABOVE_NORMAL, deps),
    oomScoreAdjusted: setLinuxOomScore(pid, SSH_OOM_SCORE_ADJUSTMENT, deps)
  }
}

export function normalizeSshWorkloadProcess(
  pid: number | undefined,
  deps: ProcessPriorityDependencies = defaultDependencies
): ProcessPriorityResult {
  if (
    pid === undefined ||
    pid === deps.currentPid ||
    !isValidPid(pid) ||
    !isAdjustableProcess(pid, deps)
  ) {
    return { schedulerAdjusted: false, oomScoreAdjusted: false }
  }
  return {
    schedulerAdjusted: setSchedulerPriority(pid, constants.priority.PRIORITY_NORMAL, deps),
    oomScoreAdjusted: setLinuxOomScore(pid, SSH_WORKLOAD_OOM_SCORE_ADJUSTMENT, deps)
  }
}
