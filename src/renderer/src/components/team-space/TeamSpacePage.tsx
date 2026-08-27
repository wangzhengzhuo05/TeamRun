import { LogOut, UsersRound } from 'lucide-react'
import { useTeamSpaceWorkspace } from './useTeamSpaceWorkspace'
import { TeamSpaceSignIn } from './TeamSpaceSignIn'
import {
  CreateOrganizationDialog,
  CreateProjectDialog,
  CreateRepositoryDialog
} from './TeamSpaceSetupDialogs'
import { CreateTeamTaskDialog } from './CreateTeamTaskDialog'
import { TeamTaskList } from './TeamTaskList'
import { TeamTaskDetail } from './TeamTaskDetail'
import { TeamMembersDialog } from './TeamMembersDialog'
import { TeamCollaborationDialog } from './TeamCollaborationDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

export default function TeamSpacePage() {
  const workspace = useTeamSpaceWorkspace()

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

  return (
    <div className="team-space-shell flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <UsersRound className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold">
                {translate('auto.components.team.space.TeamSpacePage.60190506d5', 'Team Space')}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {workspace.auth.email ??
                  translate('auto.components.team.space.TeamSpacePage.4b5d94ac3e', 'Signed in')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {workspace.syncStatus ? (
              <Button
                variant="ghost"
                size="sm"
                className="px-1"
                onClick={workspace.retrySync}
                disabled={workspace.syncStatus.connection === 'connecting'}
              >
                <Badge
                  variant={
                    workspace.syncStatus.connection === 'blocked'
                      ? 'destructive'
                      : workspace.syncStatus.connection === 'online'
                        ? 'outline'
                        : 'secondary'
                  }
                >
                  {workspace.syncStatus.connection === 'online'
                    ? translate('auto.components.team.space.TeamSpacePage.d1821ea669', 'Synced')
                    : workspace.syncStatus.connection === 'connecting'
                      ? translate('auto.components.team.space.TeamSpacePage.64634f5670', 'Syncing…')
                      : workspace.syncStatus.connection === 'blocked'
                        ? translate(
                            'auto.components.team.space.TeamSpacePage.0e6814c307',
                            'Sync blocked'
                          )
                        : translate(
                            'auto.components.team.space.TeamSpacePage.01b927d2d1',
                            'Offline cache'
                          )}
                  {workspace.syncStatus.pendingMutations > 0
                    ? translate(
                        'auto.components.team.space.TeamSpacePage.db8395a8d6',
                        ' · {{value0}} pending',
                        { value0: workspace.syncStatus.pendingMutations }
                      )
                    : ''}
                </Badge>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate(
                'auto.components.team.space.TeamSpacePage.99d00e4bca',
                'Sign out'
              )}
              onClick={workspace.signOut}
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[min(100%,22rem)] flex-1 flex-wrap items-center gap-2">
            <Select
              value={workspace.organizationId ?? ''}
              onValueChange={workspace.selectOrganization}
            >
              <SelectTrigger className="min-w-40 flex-1">
                <SelectValue
                  placeholder={translate(
                    'auto.components.team.space.TeamSpacePage.023381a7e7',
                    'Organization'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={workspace.projectId ?? ''} onValueChange={workspace.selectProject}>
              <SelectTrigger className="min-w-40 flex-1">
                <SelectValue
                  placeholder={translate(
                    'auto.components.team.space.TeamSpacePage.dc9763afa5',
                    'Project'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.key} · {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CreateOrganizationDialog onCreate={workspace.createOrganization} />
            <TeamCollaborationDialog projectId={workspace.projectId} />
            <TeamMembersDialog
              organizationId={workspace.organizationId}
              canManage={
                selectedOrganization?.role === 'owner' || selectedOrganization?.role === 'admin'
              }
            />
            <CreateProjectDialog
              disabled={!workspace.organizationId}
              onCreate={workspace.createProject}
            />
            <CreateRepositoryDialog
              disabled={!workspace.projectId}
              onCreate={workspace.createRepository}
            />
          </div>
        </div>
      </header>
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
                {workspace.tasks.length}{' '}
                {translate('auto.components.team.space.TeamSpacePage.3598cbd1e2', 'total')}
              </p>
            </div>
            <CreateTeamTaskDialog
              repositories={workspace.repositories}
              disabled={!workspace.projectId}
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
            eventRevision={workspace.eventRevision}
            onTaskChanged={workspace.refreshTasks}
            onBack={() => workspace.selectTask(null)}
          />
        </main>
      </div>
    </div>
  )
}
