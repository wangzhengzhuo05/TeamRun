import { useCallback, useEffect, useState } from 'react'
import { Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { OrganizationInvitation, OrganizationMember } from '../../../../shared/teamrun-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  organizationId: string | null
  canManage: boolean
  compact?: boolean
}

export function TeamMembersDialog({ organizationId, canManage, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const triggerLabel = translate(
    'auto.components.team.space.TeamMembersDialog.785f97f193',
    'Members'
  )

  const load = useCallback(async () => {
    if (!organizationId) {
      return
    }
    const [nextMembers, nextInvitations] = await Promise.all([
      window.api.teamRun.organizations.listMembers(organizationId),
      canManage
        ? window.api.teamRun.organizations.listInvitations(organizationId)
        : Promise.resolve([])
    ])
    setMembers(nextMembers)
    setInvitations(nextInvitations)
  }, [canManage, organizationId])

  useEffect(() => {
    if (open) {
      void load().catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.team.space.TeamMembersDialog.6dc33dd63f',
                'Unable to load members'
              )
        )
      )
    }
  }, [load, open])

  const invite = async () => {
    if (!organizationId) {
      return
    }
    try {
      await window.api.teamRun.organizations.invite({ organizationId, email: email.trim(), role })
      setEmail('')
      await load()
    } catch (error) {
      const queued = reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMembersDialog.8f0eaf500d',
          'Unable to invite member'
        )
      )
      if (queued) {
        setEmail('')
      }
    }
  }

  const removeMember = async (userId: string) => {
    if (!organizationId) {
      return
    }
    try {
      await window.api.teamRun.organizations.removeMember({ organizationId, userId })
      await load()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMembersDialog.removeError',
          'Unable to remove member'
        )
      )
    }
  }

  const revoke = async (invitationId: string) => {
    if (!organizationId) {
      return
    }
    try {
      await window.api.teamRun.organizations.revokeInvitation({ organizationId, invitationId })
      await load()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMembersDialog.revokeError',
          'Unable to revoke invitation'
        )
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant={compact ? 'ghost' : 'outline'}
              size="sm"
              aria-label={triggerLabel}
              disabled={!organizationId}
            >
              <Users />{' '}
              <span className={compact ? 'team-space-dock-label' : undefined}>{triggerLabel}</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={4}
          className={compact ? 'team-space-compact-dock-tooltip hidden' : 'hidden'}
        >
          {triggerLabel}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamMembersDialog.1b61fd93a3',
              'Organization members'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamMembersDialog.5f04ee9461',
              'Manage access without sharing Agent prompts or private workspace data.'
            )}
          </DialogDescription>
        </DialogHeader>
        {canManage ? (
          <div className="grid grid-cols-[minmax(0,1fr)_8rem_auto] gap-2">
            <div className="space-y-2">
              <Label htmlFor="teamrun-invite-email">
                {translate('auto.components.team.space.TeamMembersDialog.207b48b11f', 'Email')}
              </Label>
              <Input
                id="teamrun-invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                {translate('auto.components.team.space.TeamMembersDialog.424211afdd', 'Role')}
              </Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    {translate('auto.components.team.space.TeamMembersDialog.6df91988f4', 'Member')}
                  </SelectItem>
                  <SelectItem value="admin">
                    {translate('auto.components.team.space.TeamMembersDialog.56b4fe831a', 'Admin')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="self-end" disabled={!email.trim()} onClick={invite}>
              <UserPlus />{' '}
              {translate('auto.components.team.space.TeamMembersDialog.026448eaaa', 'Invite')}
            </Button>
          </div>
        ) : null}
        <div className="scrollbar-sleek min-h-0 space-y-2 overflow-y-auto">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{member.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{member.email}</div>
              </div>
              <Badge variant="outline">{member.role}</Badge>
              {canManage && member.role !== 'owner' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.team.space.TeamMembersDialog.2cc90be5fe',
                    'Remove {{value0}}',
                    { value0: member.displayName }
                  )}
                  onClick={() => removeMember(member.userId)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
          {invitations
            .filter((invitation) => invitation.status === 'pending')
            .map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center gap-3 rounded-md border border-dashed border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{invitation.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.team.space.TeamMembersDialog.9180bc785a',
                      'Pending until'
                    )}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="secondary">{invitation.role}</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.team.space.TeamMembersDialog.78911cff23',
                    'Revoke {{value0}}',
                    { value0: invitation.email }
                  )}
                  onClick={() => revoke(invitation.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
