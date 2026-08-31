import { useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRun, ContextSnapshot, TeamAgent } from '../../../../shared/teamrun-api'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { useAppStore } from '@/store'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { launchWorkItemDirect } from '@/lib/launch-work-item-direct'
import { launchTeamRunFolderAgent } from '@/lib/teamrun-folder-agent-launch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { isTeamRunMutationQueued } from './teamrun-mutation-feedback'
import { GenericCliCommandConfirmation } from './GenericCliCommandConfirmation'

type Props = {
  taskId: string
  projectId: string
  taskTitle: string
  latestSnapshot: ContextSnapshot | null
  onRefresh: () => Promise<void>
}

export function TeamAgentLauncher(props: Props) {
  const repos = useAppStore((state) => state.repos)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const defaultAgent = useAppStore((state) => state.settings?.defaultTuiAgent)
  const gitRepos = useMemo(() => repos.filter((repo) => repo.kind !== 'folder'), [repos])
  const workspaceOptions = useMemo(
    () => [
      ...gitRepos.map((repo) => ({
        value: `git:${repo.id}`,
        kind: 'git' as const,
        id: repo.id,
        label: repo.displayName
      })),
      ...folderWorkspaces.map((workspace) => ({
        value: `folder:${workspace.id}`,
        kind: 'folder' as const,
        id: workspace.id,
        label: workspace.name
      }))
    ],
    [folderWorkspaces, gitRepos]
  )
  const catalog = useMemo(() => getAgentCatalog(), [])
  const knownAgentIds = useMemo(() => new Set(catalog.map((entry) => entry.id)), [catalog])
  const [workspaceValue, setWorkspaceValue] = useState(workspaceOptions[0]?.value ?? '')
  const initialAgent = defaultAgent && defaultAgent !== 'blank' ? defaultAgent : 'codex'
  const [agentSelection, setAgentSelection] = useState(`agent:${initialAgent}`)
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([])
  const [count, setCount] = useState('2')
  const [genericCommandConfirmed, setGenericCommandConfirmed] = useState(false)
  const [launching, setLaunching] = useState(false)
  const selectedTeamAgent = teamAgents.find((entry) => `team:${entry.id}` === agentSelection)
  const agent = (selectedTeamAgent?.agentKind ?? agentSelection.slice('agent:'.length)) as TuiAgent
  const selectedWorkspace = workspaceOptions.find((option) => option.value === workspaceValue)
  const genericLaunchCommand =
    selectedTeamAgent?.agentKind === 'generic-cli'
      ? (selectedTeamAgent.launchCommand?.trim() ?? '')
      : ''

  useEffect(() => {
    void window.api.teamRun.collaboration
      .listTeamAgents(props.projectId)
      .then((entries) =>
        setTeamAgents(
          entries.filter(
            (entry) =>
              knownAgentIds.has(entry.agentKind as TuiAgent) ||
              (entry.agentKind === 'generic-cli' && Boolean(entry.launchCommand?.trim()))
          )
        )
      )
      .catch(() => setTeamAgents([]))
  }, [knownAgentIds, props.projectId])

  useEffect(() => {
    if (!workspaceOptions.some((option) => option.value === workspaceValue)) {
      setWorkspaceValue(workspaceOptions[0]?.value ?? '')
    }
  }, [workspaceOptions, workspaceValue])

  useEffect(() => {
    if (selectedWorkspace?.kind === 'folder' && count !== '1') {
      setCount('1')
    }
  }, [count, selectedWorkspace?.kind])

  const launch = async () => {
    const snapshot = props.latestSnapshot
    if (!snapshot || !selectedWorkspace) {
      return
    }
    setLaunching(true)
    try {
      const links: Promise<void>[] = []
      const launchCount = selectedWorkspace.kind === 'folder' ? 1 : Number(count)
      const context = selectedTeamAgent
        ? `# Team Agent: ${selectedTeamAgent.name}\n\n${selectedTeamAgent.instructionsMarkdown}\n\n# Frozen task context\n\n${snapshot.renderedMarkdown}`
        : snapshot.renderedMarkdown
      const agentCommandOverride =
        selectedTeamAgent?.agentKind === 'generic-cli' ? selectedTeamAgent.launchCommand : undefined
      const linkWorkspace = (args: {
        clientRunId: string
        workspaceId: string
        workspacePath: string
        baseRevision: AgentRun['baseRevision']
      }) => linkAgentRun({ ...args, snapshot, agent, selectedTeamAgent, taskId: props.taskId })
      const launches = Array.from({ length: launchCount }, () => {
        const clientRunId = crypto.randomUUID()
        if (selectedWorkspace.kind === 'folder') {
          return launchTeamRunFolderAgent({
            folderWorkspaceId: selectedWorkspace.id,
            agent,
            agentCommandOverride,
            context,
            onWorkspaceReady: (workspace) => {
              const linking = linkWorkspace({
                clientRunId,
                workspaceId: workspace.id,
                workspacePath: workspace.path,
                baseRevision: { kind: 'folder', contextHash: snapshot.hash }
              })
              links.push(linking)
              return linking
            }
          })
        }
        return launchWorkItemDirect({
          item: {
            title: props.taskTitle,
            type: 'issue',
            number: null,
            url: `teamrun://tasks/${props.taskId}`,
            pasteContent: context
          },
          repoId: selectedWorkspace.id,
          launchSource: 'task_page',
          telemetrySource: 'unknown',
          agentOverride: agent,
          agentCommandOverride,
          promptDelivery: agent === 'generic-cli' ? 'auto-submit' : 'submit-after-ready',
          openModalFallback: () =>
            toast.error(
              translate(
                'auto.components.team.space.TeamAgentLauncher.setupPolicyRequired',
                'Choose a setup policy for this repository before launching TeamRun agents.'
              )
            ),
          onWorkspaceCreated: (workspace) => {
            const linking = linkWorkspace({
              clientRunId,
              workspaceId: workspace.id,
              workspacePath: workspace.path,
              baseRevision: { kind: 'git', objectId: workspace.head }
            })
            links.push(linking)
            return linking
          }
        })
      })
      const results = await Promise.allSettled(launches)
      await Promise.allSettled(links)
      await props.onRefresh()
      const started = results.filter(
        (result) => result.status === 'fulfilled' && result.value
      ).length
      if (started > 0) {
        toast.success(
          translate(
            'auto.components.team.space.TeamAgentLauncher.50e9904340',
            'Started {{value0}} TeamRun agent workspace{{value1}}.',
            { value0: started, value1: started === 1 ? '' : 's' }
          )
        )
      }
      if (started < launchCount) {
        toast.error(
          translate(
            'auto.components.team.space.TeamAgentLauncher.partialFailure',
            '{{value0}} agent workspace{{value1}} could not be started.',
            { value0: launchCount - started, value1: launchCount - started === 1 ? '' : 's' }
          )
        )
      }
    } finally {
      setLaunching(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="team-space-agent-launcher-header flex items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_16rem]">
          <h3 className="text-sm font-semibold">
            {translate(
              'auto.components.team.space.TeamAgentLauncher.openTaskTitle',
              'Open task in TeamRun'
            )}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentLauncher.03975ebdf8',
              'Git agents use independent worktrees. A folder workspace launches one Agent tab without copying or changing the source folder.'
            )}
          </p>
        </div>
        <Button
          disabled={
            !props.latestSnapshot ||
            !selectedWorkspace ||
            launching ||
            (Boolean(genericLaunchCommand) && !genericCommandConfirmed)
          }
          onClick={launch}
        >
          <Play />{' '}
          {launching
            ? translate('auto.components.team.space.TeamAgentLauncher.49f1951c0b', 'Launching…')
            : translate(
                'auto.components.team.space.TeamAgentLauncher.openInTeamRun',
                'Open in TeamRun'
              )}
        </Button>
      </div>
      <div className="team-space-agent-launcher-fields mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] gap-3">
        <Select value={workspaceValue} onValueChange={setWorkspaceValue}>
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={translate(
                'auto.components.team.space.TeamAgentLauncher.883c087e34',
                'Repository workspace'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {workspaceOptions.map((workspace) => (
              <SelectItem key={workspace.value} value={workspace.value}>
                {workspace.label} ·{' '}
                {workspace.kind === 'git'
                  ? translate('auto.components.team.space.TeamAgentLauncher.e058033aa0', 'Git')
                  : translate('auto.components.team.space.TeamAgentLauncher.511baae8d9', 'Folder')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={agentSelection}
          onValueChange={(value) => {
            setAgentSelection(value)
            setGenericCommandConfirmed(false)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((entry) => (
              <SelectItem key={entry.id} value={`agent:${entry.id}`}>
                {entry.label}
              </SelectItem>
            ))}
            {teamAgents.map((entry) => (
              <SelectItem key={entry.id} value={`team:${entry.id}`}>
                {entry.name}{' '}
                {translate(
                  'auto.components.team.space.TeamAgentLauncher.71aa5194e9',
                  '· Team Agent'
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedWorkspace?.kind === 'folder' ? '1' : count}
          onValueChange={setCount}
          disabled={selectedWorkspace?.kind === 'folder'}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}{' '}
                {translate('auto.components.team.space.TeamAgentLauncher.72bc9f2414', 'agent')}
                {value === 1 ? '' : 's'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {genericLaunchCommand ? (
        <GenericCliCommandConfirmation
          command={genericLaunchCommand}
          confirmed={genericCommandConfirmed}
          onConfirmedChange={setGenericCommandConfirmed}
        />
      ) : null}
      {!props.latestSnapshot ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentLauncher.57385fe0d3',
            'Freeze a context snapshot first.'
          )}
        </p>
      ) : null}
      {workspaceOptions.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentLauncher.e6a3610e1e',
            'Add a Git repository or folder workspace before launching an agent.'
          )}
        </p>
      ) : null}
    </section>
  )
}

async function linkAgentRun(args: {
  taskId: string
  snapshot: ContextSnapshot
  agent: TuiAgent
  selectedTeamAgent: TeamAgent | undefined
  clientRunId: string
  workspaceId: string
  workspacePath: string
  baseRevision: AgentRun['baseRevision']
}): Promise<void> {
  const run = await window.api.teamRun.runs.createLinked({
    taskId: args.taskId,
    run: {
      contextSnapshotId: args.snapshot.id,
      agentKind: args.agent,
      ...(args.selectedTeamAgent ? { teamAgentId: args.selectedTeamAgent.id } : {}),
      baseRevision: args.baseRevision,
      clientRunId: args.clientRunId
    },
    workspaceId: args.workspaceId,
    workspacePath: args.workspacePath
  })
  const heartbeatAt = new Date().toISOString()
  await window.api.teamRun.runs
    .updateStatus({
      runId: run.id,
      status: { sequence: 1, status: 'starting', heartbeatAt }
    })
    .catch((error) => {
      if (!isTeamRunMutationQueued(error)) {
        throw error
      }
    })
  await window.api.teamRun.runs
    .updateStatus({
      runId: run.id,
      status: { sequence: 2, status: 'working', heartbeatAt }
    })
    .catch((error) => {
      if (!isTeamRunMutationQueued(error)) {
        throw error
      }
    })
}
