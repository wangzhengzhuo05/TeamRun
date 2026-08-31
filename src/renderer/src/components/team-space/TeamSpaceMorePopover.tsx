import { LogOut, Plus, Settings2 } from 'lucide-react'
import type { Organization, Project } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  CreateOrganizationDialog,
  CreateProjectDialog,
  CreateRepositoryDialog
} from './TeamSpaceSetupDialogs'
import { JoinTeamDialog } from './JoinTeamDialog'

type Props = {
  organizations: Organization[]
  projects: Project[]
  organizationId: string | null
  projectId: string | null
  canDevelopTeam: boolean
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
  onJoinTeam: (code: string) => Promise<void>
  onSignOut: () => Promise<void>
}

export function TeamSpaceMorePopover(props: Props) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('auto.components.team.space.TeamSpaceMorePopover.more', 'More')}
            >
              <Plus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate('auto.components.team.space.TeamSpaceMorePopover.more', 'More')}
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-80 p-3">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            {translate(
              'auto.components.team.space.TeamSpaceMorePopover.workspace',
              'Team workspace'
            )}
          </h2>
        </div>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamSpaceMorePopover.organization',
                'Organization'
              )}
            </Label>
            <Select value={props.organizationId ?? ''} onValueChange={props.onSelectOrganization}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {translate('auto.components.team.space.TeamSpaceMorePopover.project', 'Project')}
            </Label>
            <Select value={props.projectId ?? ''} onValueChange={props.onSelectProject}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={translate(
                    'auto.components.team.space.TeamSpaceMorePopover.chooseProject',
                    'Choose a project'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {props.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.key} · {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <JoinTeamDialog onJoin={props.onJoinTeam} />
          <CreateOrganizationDialog compact onCreate={props.onCreateOrganization} />
          <CreateProjectDialog
            compact
            disabled={!props.organizationId || !props.canDevelopTeam}
            onCreate={props.onCreateProject}
          />
          <CreateRepositoryDialog
            compact
            disabled={!props.projectId || !props.canDevelopTeam}
            onCreate={props.onCreateRepository}
          />
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={props.onSignOut}
          >
            <LogOut />
            {translate('auto.components.team.space.TeamSpaceMorePopover.signOut', 'Sign out')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
