import { ArrowLeft, Bot, FileCheck2, FileText, MessagesSquare } from 'lucide-react'
import { useTeamTaskWorkspace } from './useTeamTaskWorkspace'
import { TaskConversationPanel } from './TaskConversationPanel'
import { TaskContextPanel } from './TaskContextPanel'
import { TeamAgentRunPanel } from './TeamAgentRunPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { TaskResultsPanel } from './TaskResultsPanel'

const DETAIL_TABS = [
  {
    value: 'conversation',
    icon: MessagesSquare,
    label: () => translate('auto.components.team.space.TeamTaskDetail.9ac6f4b345', 'Overview')
  },
  {
    value: 'context',
    icon: FileText,
    label: () => translate('auto.components.team.space.TeamTaskDetail.ee456389ae', 'Context')
  },
  {
    value: 'runs',
    icon: Bot,
    label: () => translate('auto.components.team.space.TeamTaskDetail.b4dbc18417', 'Agent runs')
  },
  {
    value: 'results',
    icon: FileCheck2,
    label: () => translate('auto.components.team.space.TeamTaskDetail.results', 'Results')
  }
] as const

type Props = {
  taskId: string | null
  canDevelop: boolean
  onTaskChanged: () => Promise<void>
  eventRevision: number
  onBack: () => void
}

export function TeamTaskDetail({
  taskId,
  canDevelop,
  onTaskChanged,
  eventRevision,
  onBack
}: Props) {
  const workspace = useTeamTaskWorkspace(taskId, onTaskChanged, eventRevision)

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.team.space.TeamTaskDetail.327543a112',
          'Select a task to view its context and agent runs.'
        )}
      </div>
    )
  }
  if (workspace.loading || !workspace.task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('auto.components.team.space.TeamTaskDetail.5789758699', 'Loading task…')}
      </div>
    )
  }

  return (
    <Tabs defaultValue="conversation" className="h-full min-h-0 gap-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="team-space-compact-back hidden shrink-0"
          onClick={onBack}
        >
          <ArrowLeft />
          {translate('auto.components.team.space.TeamSpacePage.6b793be66b', 'Tasks')}
        </Button>
        <div className="scrollbar-sleek min-w-0 flex-1 overflow-x-auto px-2">
          <TabsList variant="line">
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon
              const label = tab.label()
              return (
                <Tooltip key={tab.value}>
                  <TooltipTrigger asChild>
                    <TabsTrigger value={tab.value} aria-label={label}>
                      <Icon />
                      <span className="team-space-tab-label">{label}</span>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent className="team-space-compact-tab-tooltip hidden">
                    {label}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </TabsList>
        </div>
      </div>
      <TabsContent value="conversation" className="flex min-h-0">
        <TaskConversationPanel
          task={workspace.task}
          members={workspace.members}
          comments={workspace.comments}
          canManageTask={canDevelop}
          onStatusChange={workspace.updateStatus}
          onOwnerChange={workspace.updateOwner}
          onComment={workspace.addComment}
        />
      </TabsContent>
      <TabsContent value="context" className="flex min-h-0">
        <TaskContextPanel
          snapshots={workspace.snapshots}
          canCreate={canDevelop}
          onCreate={workspace.createSnapshot}
        />
      </TabsContent>
      <TabsContent value="runs" className="flex min-h-0">
        <TeamAgentRunPanel
          taskId={workspace.task.id}
          projectId={workspace.task.projectId}
          taskTitle={workspace.task.title}
          snapshots={workspace.snapshots}
          runs={workspace.runs}
          publications={workspace.publications}
          verifications={workspace.verifications}
          canDevelop={canDevelop}
          onRefresh={workspace.refreshRuns}
          onTaskChanged={onTaskChanged}
        />
      </TabsContent>
      <TabsContent value="results" className="flex min-h-0">
        <TaskResultsPanel publications={workspace.publications} />
      </TabsContent>
    </Tabs>
  )
}
