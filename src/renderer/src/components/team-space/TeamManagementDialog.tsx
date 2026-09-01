import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { TeamAgentManagement } from './TeamAgentManagement'
import { TeamMemberManagement } from './TeamMemberManagement'

type Props = {
  organizationId: string | null
  projectId: string | null
  canManage: boolean
}

export function TeamManagementDialog({ organizationId, projectId, canManage }: Props) {
  const [open, setOpen] = useState(false)
  const label = translate(
    'auto.components.team.space.TeamManagementDialog.management',
    'Team management'
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={label} disabled={!organizationId}>
              <Settings2 />
              <span className="team-space-dock-label">{label}</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={4}
          className="team-space-compact-dock-tooltip hidden"
        >
          {label}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {canManage
              ? translate(
                  'auto.components.team.space.TeamManagementDialog.ownerDescription',
                  'Manage Team access, roles, and reusable Team Agents.'
                )
              : translate(
                  'auto.components.team.space.TeamManagementDialog.memberDescription',
                  'View Team members and reusable Team Agents.'
                )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="members" className="min-h-0">
          <TabsList>
            <TabsTrigger value="members">
              {translate('auto.components.team.space.TeamManagementDialog.members', 'Members')}
            </TabsTrigger>
            <TabsTrigger value="agents" disabled={!projectId}>
              {translate('auto.components.team.space.TeamManagementDialog.agents', 'Team Agents')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="min-h-0 overflow-y-auto">
            <TeamMemberManagement
              organizationId={organizationId}
              canManage={canManage}
              active={open}
            />
          </TabsContent>
          <TabsContent value="agents" className="min-h-0 overflow-y-auto">
            <TeamAgentManagement projectId={projectId} canManage={canManage} active={open} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
