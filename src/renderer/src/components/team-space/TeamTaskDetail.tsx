import { Bot, FileCheck2, FileText, MessagesSquare } from 'lucide-react'
import { useTeamTaskWorkspace } from './useTeamTaskWorkspace'
import { TaskConversationPanel } from './TaskConversationPanel'
import { TaskContextPanel } from './TaskContextPanel'
import { TeamAgentRunPanel } from './TeamAgentRunPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { TaskResultsPanel } from './TaskResultsPanel'

type Props = {
  taskId: string | null
  onTaskChanged: () => Promise<void>
  eventRevision: number
}

export function TeamTaskDetail({ taskId, onTaskChanged, eventRevision }: Props) {
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
      <div className="border-b border-border px-5 py-2">
        <TabsList variant="line">
          <TabsTrigger value="conversation">
            <MessagesSquare />{' '}
            {translate('auto.components.team.space.TeamTaskDetail.9ac6f4b345', 'Overview')}
          </TabsTrigger>
          <TabsTrigger value="context">
            <FileText />{' '}
            {translate('auto.components.team.space.TeamTaskDetail.ee456389ae', 'Context')}
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Bot />{' '}
            {translate('auto.components.team.space.TeamTaskDetail.b4dbc18417', 'Agent runs')}
          </TabsTrigger>
          <TabsTrigger value="results">
            <FileCheck2 />{' '}
            {translate('auto.components.team.space.TeamTaskDetail.results', 'Results')}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="conversation" className="flex min-h-0">
        <TaskConversationPanel
          task={workspace.task}
          members={workspace.members}
          comments={workspace.comments}
          onStatusChange={workspace.updateStatus}
          onOwnerChange={workspace.updateOwner}
          onComment={workspace.addComment}
        />
      </TabsContent>
      <TabsContent value="context" className="flex min-h-0">
        <TaskContextPanel snapshots={workspace.snapshots} onCreate={workspace.createSnapshot} />
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
