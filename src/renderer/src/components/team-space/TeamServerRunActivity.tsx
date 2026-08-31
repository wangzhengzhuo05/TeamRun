import { useEffect, useState } from 'react'
import { Loader2, Server } from 'lucide-react'
import type { AgentRun, TeamServerDevelopmentRunState } from '../../../../shared/teamrun-api'
import { translate } from '@/i18n/i18n'
import { teamRunErrorMessage } from './teamrun-error-message'

const RENDER_LIMIT = 120_000

export function TeamServerRunActivity(props: { run: AgentRun; onRefresh: () => Promise<void> }) {
  const { run, onRefresh } = props
  const [state, setState] = useState<TeamServerDevelopmentRunState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const next = await window.api.teamRun.runs.getTeamServerState(run.id)
        if (!active) {
          return
        }
        setState(next)
        setError('')
        if (next.sequence > run.lastSequence) {
          await onRefresh().catch(() => undefined)
        }
        if (next.status === 'starting' || next.status === 'working') {
          timer = setTimeout(load, 3_000)
        }
      } catch (cause) {
        if (!active) {
          return
        }
        setError(
          teamRunErrorMessage(
            cause,
            translate(
              'auto.components.team.space.TeamServerRunActivity.loadError',
              'Unable to load Team Server activity'
            )
          )
        )
        timer = setTimeout(load, 10_000)
      }
    }
    void load()
    return () => {
      active = false
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [onRefresh, run.id, run.lastSequence])

  if (!state) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        {error ? null : <Loader2 className="size-3.5 animate-spin" />}
        {error ||
          translate(
            'auto.components.team.space.TeamServerRunActivity.loading',
            'Loading Team Server activity…'
          )}
      </div>
    )
  }

  const activity = renderTail(state.activityLog)
  const diff = renderHead(state.diffPatch)
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Server className="size-3.5" />
          {translate('auto.components.team.space.TeamServerRunActivity.teamServer', 'Team Server')}
        </span>
        <span>{state.branchName}</span>
        {state.failureCode ? <span className="text-destructive">{state.failureCode}</span> : null}
      </div>
      <ActivityDetails
        label={translate(
          'auto.components.team.space.TeamServerRunActivity.activity',
          'Shared activity log'
        )}
        value={activity.value}
        clipped={activity.clipped || state.logTruncated}
      />
      {state.diffPatch ? (
        <ActivityDetails
          label={translate(
            'auto.components.team.space.TeamServerRunActivity.changes',
            'Workspace changes'
          )}
          value={diff.value}
          clipped={diff.clipped || state.diffTruncated}
        />
      ) : null}
    </div>
  )
}

function ActivityDetails(props: { label: string; value: string; clipped: boolean }) {
  return (
    <details className="rounded-md border border-border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">{props.label}</summary>
      <pre className="scrollbar-sleek max-h-72 overflow-auto border-t border-border p-3 font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground">
        {props.value ||
          translate(
            'auto.components.team.space.TeamServerRunActivity.noActivity',
            'No activity reported yet.'
          )}
      </pre>
      {props.clipped ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamServerRunActivity.truncated',
            'The displayed output is truncated.'
          )}
        </p>
      ) : null}
    </details>
  )
}

function renderTail(value: string): { value: string; clipped: boolean } {
  return value.length > RENDER_LIMIT
    ? { value: value.slice(-RENDER_LIMIT), clipped: true }
    : { value, clipped: false }
}

function renderHead(value: string): { value: string; clipped: boolean } {
  return value.length > RENDER_LIMIT
    ? { value: value.slice(0, RENDER_LIMIT), clipped: true }
    : { value, clipped: false }
}
