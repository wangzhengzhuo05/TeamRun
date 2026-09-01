import { useEffect, useState } from 'react'
import { Play, Server } from 'lucide-react'
import { toast } from 'sonner'
import type { ContextSnapshot, TeamAgent } from '../../../../shared/teamrun-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  projectId: string
  taskId: string
  latestSnapshot: ContextSnapshot | null
  onRefresh: () => Promise<void>
}

export function TeamServerAgentLauncher(props: Props) {
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.teamRun.collaboration
      .listTeamAgents(props.projectId)
      .then((items) => {
        if (!active) {
          return
        }
        const eligible = items.filter(
          (agent) => agent.yoloMode && agent.agentKind === 'opencode' && agent.modelConnectionId
        )
        setAgents(eligible)
        setSelectedAgentId((current) =>
          eligible.some((agent) => agent.id === current) ? current : (eligible[0]?.id ?? '')
        )
      })
      .catch((error) => {
        if (active) {
          reportTeamRunMutation(
            error,
            translate(
              'auto.components.team.space.TeamServerAgentLauncher.loadError',
              'Unable to load Team Agents'
            )
          )
        }
      })
    return () => {
      active = false
    }
  }, [props.projectId])

  const launch = async () => {
    if (!props.latestSnapshot || !selectedAgentId) {
      return
    }
    setLaunching(true)
    try {
      await window.api.teamRun.runs.startTeamServer({
        taskId: props.taskId,
        run: {
          contextSnapshotId: props.latestSnapshot.id,
          teamAgentId: selectedAgentId
        }
      })
      await props.onRefresh()
      toast.success(
        translate(
          'auto.components.team.space.TeamServerAgentLauncher.started',
          'Team Server development run started.'
        )
      )
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamServerAgentLauncher.launchError',
          'Unable to start Team Server development run'
        )
      )
    } finally {
      setLaunching(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_16rem]">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Server className="size-4 text-muted-foreground" />
            {translate(
              'auto.components.team.space.TeamServerAgentLauncher.title',
              'Run a Team Agent on the Team Server'
            )}
            <Badge variant="outline">
              {translate(
                'auto.components.team.space.TeamServerAgentLauncher.experimental',
                'Experimental'
              )}
            </Badge>
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamServerAgentLauncher.description',
              'The shared Agent works from frozen context in an isolated server worktree. Activity and changes are Team-visible; this phase does not push or open a review request.'
            )}
          </p>
        </div>
        <Button disabled={!props.latestSnapshot || !selectedAgentId || launching} onClick={launch}>
          <Play />
          {launching
            ? translate('auto.components.team.space.TeamServerAgentLauncher.starting', 'Starting…')
            : translate('auto.components.team.space.TeamServerAgentLauncher.start', 'Start run')}
        </Button>
      </div>
      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
        <SelectTrigger className="mt-4 w-full">
          <SelectValue
            placeholder={translate(
              'auto.components.team.space.TeamServerAgentLauncher.agentPlaceholder',
              'YOLO-enabled Team Agent'
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!props.latestSnapshot ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamServerAgentLauncher.snapshotRequired',
            'Freeze a context snapshot first.'
          )}
        </p>
      ) : null}
      {agents.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamServerAgentLauncher.agentRequired',
            'Create a Team Agent with YOLO mode enabled before starting development work.'
          )}
        </p>
      ) : null}
    </section>
  )
}
