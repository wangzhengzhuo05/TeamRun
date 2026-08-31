import { useState } from 'react'
import { Cloud, CloudOff, Loader2, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { CreateTeamTaskDialog } from './CreateTeamTaskDialog'
import { TeamSpaceChatPanel } from './TeamSpaceChatPanel'
import { TeamSpaceDock, type TeamSpaceView } from './TeamSpaceDock'
import { TeamSpaceSignIn } from './TeamSpaceSignIn'
import { TeamFilesPanel } from './TeamFilesPanel'
import { TeamTaskDetail } from './TeamTaskDetail'
import { TeamTaskList } from './TeamTaskList'
import { useTeamSpaceChat } from './useTeamSpaceChat'
import { useTeamSpaceWorkspace } from './useTeamSpaceWorkspace'

export default function TeamSpacePage() {
  const workspace = useTeamSpaceWorkspace()
  const [view, setView] = useState<TeamSpaceView>('chat')
  const chat = useTeamSpaceChat(
    workspace.organizationId,
    workspace.projectId,
    workspace.eventRevision
  )

  if (workspace.auth?.state !== 'signed-in') {
    return (
      <TeamSpaceSignIn
        auth={workspace.auth}
        loading={workspace.loading}
        onSignIn={workspace.signIn}
      />
    )
  }

  const selectedOrganization = workspace.organizations.find(
    (organization) => organization.id === workspace.organizationId
  )
  const selectedProject = workspace.projects.find((project) => project.id === workspace.projectId)
  const selectedChannel = chat.channels.find((channel) => channel.id === chat.channelId)
  const canManageTeam = selectedOrganization?.role === 'owner'
  const canDevelopTeam =
    selectedOrganization?.role === 'owner' || selectedOrganization?.role === 'admin'
  const syncLabel =
    workspace.syncStatus?.connection === 'online'
      ? translate('auto.components.team.space.TeamSpacePage.d1821ea669', 'Synced')
      : workspace.syncStatus?.connection === 'connecting'
        ? translate('auto.components.team.space.TeamSpacePage.64634f5670', 'Syncing…')
        : workspace.syncStatus?.connection === 'blocked'
          ? translate('auto.components.team.space.TeamSpacePage.0e6814c307', 'Sync blocked')
          : translate('auto.components.team.space.TeamSpacePage.01b927d2d1', 'Offline cache')
  const locationLabel =
    view === 'chat'
      ? selectedChannel
        ? `# ${selectedChannel.name}`
        : (selectedOrganization?.name ??
          translate(
            'auto.components.team.space.TeamSpacePage.groupConversation',
            'Team conversation'
          ))
      : view === 'files'
        ? translate('auto.components.team.space.TeamSpacePage.files', 'Team Files')
        : translate('auto.components.team.space.TeamSpacePage.6b793be66b', 'Tasks')

  return (
    <div className="team-space-shell flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <UsersRound className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {selectedProject?.name ??
                selectedOrganization?.name ??
                translate('auto.components.team.space.TeamSpacePage.60190506d5', 'Team Space')}
            </h1>
            <p className="truncate text-xs text-muted-foreground">{locationLabel}</p>
          </div>
        </div>
        {workspace.syncStatus ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs text-muted-foreground"
                onClick={workspace.retrySync}
                disabled={workspace.syncStatus.connection === 'connecting'}
              >
                {workspace.syncStatus.connection === 'connecting' ? (
                  <Loader2 className="animate-spin" />
                ) : workspace.syncStatus.connection === 'online' ? (
                  <Cloud />
                ) : (
                  <CloudOff />
                )}
                <span className="team-space-sync-label">{syncLabel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {syncLabel}
              {workspace.syncStatus.pendingMutations > 0
                ? translate(
                    'auto.components.team.space.TeamSpacePage.db8395a8d6',
                    ' · {{value0}} pending',
                    { value0: workspace.syncStatus.pendingMutations }
                  )
                : ''}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </header>
      {view === 'chat' ? (
        <TeamSpaceChatPanel
          projectId={workspace.projectId}
          authUserId={workspace.auth.userId ?? null}
          channels={chat.channels}
          channelId={chat.channelId}
          messages={chat.messages}
          members={chat.members}
          teamAgents={chat.teamAgents}
          loading={chat.loading}
          sending={chat.sending}
          replyingAgentIds={chat.replyingAgentIds}
          onSelectChannel={chat.selectChannel}
          onCreateGeneralChannel={chat.createGeneralChannel}
          onSendMessage={chat.sendMessage}
        />
      ) : view === 'files' ? (
        <TeamFilesPanel
          projectId={workspace.projectId}
          eventRevision={workspace.eventRevision}
          canManageTeam={canManageTeam}
          canDevelopTeam={canDevelopTeam}
        />
      ) : (
        <div
          className="team-space-body grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)] overflow-hidden"
          data-task-selected={workspace.taskId ? 'true' : 'false'}
        >
          <aside className="team-space-task-list flex min-h-0 flex-col border-r border-border bg-muted/15">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {translate('auto.components.team.space.TeamSpacePage.6b793be66b', 'Tasks')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TeamSpacePage.taskCount',
                    '{{value0}} total',
                    { value0: workspace.tasks.length }
                  )}
                </p>
              </div>
              <CreateTeamTaskDialog
                repositories={workspace.repositories}
                disabled={!workspace.projectId || !canDevelopTeam}
                onCreate={workspace.createTask}
              />
            </div>
            <TeamTaskList
              tasks={workspace.tasks}
              selectedTaskId={workspace.taskId}
              onSelect={workspace.selectTask}
            />
          </aside>
          <main className="team-space-task-detail min-h-0 overflow-hidden">
            <TeamTaskDetail
              taskId={workspace.taskId}
              canDevelop={canDevelopTeam}
              eventRevision={workspace.eventRevision}
              onTaskChanged={workspace.refreshTasks}
              onBack={() => workspace.selectTask(null)}
            />
          </main>
        </div>
      )}
      <TeamSpaceDock
        view={view}
        organizations={workspace.organizations}
        projects={workspace.projects}
        organizationId={workspace.organizationId}
        projectId={workspace.projectId}
        canManageTeam={canManageTeam}
        canDevelopTeam={canDevelopTeam}
        onViewChange={setView}
        onSelectOrganization={workspace.selectOrganization}
        onSelectProject={workspace.selectProject}
        onCreateOrganization={workspace.createOrganization}
        onCreateProject={workspace.createProject}
        onCreateRepository={workspace.createRepository}
        onJoinTeam={workspace.joinTeam}
        onSignOut={workspace.signOut}
      />
    </div>
  )
}
