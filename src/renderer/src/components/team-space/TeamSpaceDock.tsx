import { ListTodo, MessagesSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Organization, Project } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { TeamCollaborationDialog } from './TeamCollaborationDialog'
import { TeamMembersDialog } from './TeamMembersDialog'
import { TeamSpaceMorePopover } from './TeamSpaceMorePopover'

export type TeamSpaceView = 'chat' | 'tasks'

type Props = {
  view: TeamSpaceView
  organizations: Organization[]
  projects: Project[]
  organizationId: string | null
  projectId: string | null
  canManageMembers: boolean
  onViewChange: (view: TeamSpaceView) => void
  onSelectOrganization: (id: string) => void
  onSelectProject: (id: string) => void
  onCreateOrganization: (slug: string, name: string) => Promise<void>
  onCreateProject: (key: string, name: string, contextMarkdown: string) => Promise<void>
  onCreateRepository: (input: {
    provider: 'github' | 'gitlab' | 'other'
    remoteUrl: string
    displayName: string
    defaultBranch: string
  }) => Promise<void>
  onSignOut: () => Promise<void>
}

function ViewButton({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="sm"
          data-current={active ? 'true' : undefined}
          aria-label={label}
          onClick={onClick}
        >
          {icon}
          <span className="team-space-dock-label">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="team-space-compact-dock-tooltip hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function TeamSpaceDock(props: Props) {
  return (
    <nav
      className="team-space-dock shrink-0 border-t border-border bg-card/80 px-4 py-1.5"
      aria-label={translate(
        'auto.components.team.space.TeamSpaceDock.features',
        'Team Space features'
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-1">
        <ViewButton
          active={props.view === 'chat'}
          label={translate('auto.components.team.space.TeamSpaceDock.chat', 'Chat')}
          icon={<MessagesSquare />}
          onClick={() => props.onViewChange('chat')}
        />
        <ViewButton
          active={props.view === 'tasks'}
          label={translate('auto.components.team.space.TeamSpaceDock.tasks', 'Tasks')}
          icon={<ListTodo />}
          onClick={() => props.onViewChange('tasks')}
        />
        <TeamCollaborationDialog compact initialTab="agents" projectId={props.projectId} />
        <TeamMembersDialog
          compact
          organizationId={props.organizationId}
          canManage={props.canManageMembers}
        />
        <div className="ml-auto h-5 w-px bg-border" />
        <TeamSpaceMorePopover
          organizations={props.organizations}
          projects={props.projects}
          organizationId={props.organizationId}
          projectId={props.projectId}
          onSelectOrganization={props.onSelectOrganization}
          onSelectProject={props.onSelectProject}
          onCreateOrganization={props.onCreateOrganization}
          onCreateProject={props.onCreateProject}
          onCreateRepository={props.onCreateRepository}
          onSignOut={props.onSignOut}
        />
      </div>
    </nav>
  )
}
