import { Bot, ExternalLink, ShieldCheck } from 'lucide-react'
import type {
  AgentRun,
  ResultPublication,
  VerificationResult
} from '../../../../shared/teamrun-api'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { getAgentLabel } from '@/lib/agent-catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { PublishAgentResultDialog } from './PublishAgentResultDialog'
import { RunVerificationDialog } from './RunVerificationDialog'
import { TeamServerRunActivity } from './TeamServerRunActivity'

const RUN_LABEL: Record<AgentRun['status'], () => string> = {
  queued: () => translate('teamRun.agentStatus.queued', 'Queued'),
  starting: () => translate('teamRun.agentStatus.starting', 'Starting'),
  working: () => translate('teamRun.agentStatus.working', 'Working'),
  needs_input: () => translate('teamRun.agentStatus.needsInput', 'Needs input'),
  review: () => translate('teamRun.agentStatus.review', 'Ready for review'),
  completed: () => translate('teamRun.agentStatus.completed', 'Published'),
  failed: () => translate('teamRun.agentStatus.failed', 'Failed'),
  canceled: () => translate('teamRun.agentStatus.canceled', 'Canceled')
}

export function TeamAgentRunCard(props: {
  run: AgentRun
  publication?: ResultPublication
  checks: VerificationResult[]
  canDevelop: boolean
  onOpenWorkspace: (run: AgentRun) => Promise<void>
  onMarkReady: (run: AgentRun) => Promise<void>
  onRefresh: () => Promise<void>
  onTaskChanged: () => Promise<void>
}) {
  const { run } = props
  const personal = run.executionTarget !== 'team_server'
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {getAgentLabel(run.agentKind as TuiAgent)}
            {run.teamAgentSnapshot ? ` · ${run.teamAgentSnapshot.name}` : ''}
          </span>
          <Badge variant={run.status === 'failed' ? 'destructive' : 'outline'}>
            {RUN_LABEL[run.status]()}
          </Badge>
          {!personal ? (
            <Badge variant="secondary">
              {translate('auto.components.team.space.TeamAgentRunCard.teamServer', 'Team Server')}
            </Badge>
          ) : null}
          {run.stale ? (
            <Badge variant="secondary">
              {translate(
                'auto.components.team.space.TeamAgentRunPanel.3412fc359a',
                'Stale context'
              )}
            </Badge>
          ) : null}
        </div>
        {personal ? (
          <div className="flex flex-wrap items-center gap-2">
            {props.canDevelop ? (
              <RunVerificationDialog run={run} onCompleted={props.onRefresh} />
            ) : null}
            {props.canDevelop && (run.status === 'working' || run.status === 'needs_input') ? (
              <Button variant="outline" size="sm" onClick={() => props.onMarkReady(run)}>
                {translate(
                  'auto.components.team.space.TeamAgentRunPanel.cecf8c7075',
                  'Ready for review'
                )}
              </Button>
            ) : null}
            {props.canDevelop && run.status === 'review' ? (
              <PublishAgentResultDialog
                run={run}
                verifications={props.checks}
                onPublished={async () => {
                  await Promise.all([props.onRefresh(), props.onTaskChanged()])
                }}
              />
            ) : null}
            <Button variant="outline" size="sm" onClick={() => props.onOpenWorkspace(run)}>
              <ExternalLink />
              {translate(
                'auto.components.team.space.TeamAgentRunPanel.c254620589',
                'Open workspace'
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>
          {run.baseRevision.kind === 'git'
            ? run.baseRevision.objectId.slice(0, 12)
            : translate(
                'auto.components.team.space.TeamAgentRunPanel.ae51fd0785',
                'Folder workspace'
              )}
        </span>
        {personal ? (
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5" /> {props.checks.length}{' '}
            {translate('auto.components.team.space.TeamAgentRunPanel.62179c7416', 'verification')}
            {props.checks.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {props.publication ? (
          <span>
            {translate(
              'auto.components.team.space.TeamAgentRunPanel.1ea0087769',
              'Published revision'
            )}{' '}
            {props.publication.revision}
          </span>
        ) : null}
      </div>
      {!personal ? <TeamServerRunActivity run={run} onRefresh={props.onRefresh} /> : null}
    </article>
  )
}
