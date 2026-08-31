import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { OrganizationMember, TeamInviteCode } from '../../../../shared/teamrun-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'
import { teamRunErrorMessage } from './teamrun-error-message'

type Props = {
  organizationId: string | null
  canManage: boolean
  active: boolean
}

export function TeamMemberManagement({ organizationId, canManage, active }: Props) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [inviteCodes, setInviteCodes] = useState<TeamInviteCode[]>([])
  const [latestCode, setLatestCode] = useState('')
  const [creatingCode, setCreatingCode] = useState(false)

  const load = useCallback(async () => {
    if (!organizationId) {
      return
    }
    const nextMembers = await window.api.teamRun.organizations.listMembers(organizationId)
    let nextCodes: TeamInviteCode[] = []
    if (canManage) {
      try {
        nextCodes = await window.api.teamRun.organizations.listInviteCodes(organizationId)
      } catch (error) {
        toast.error(
          teamRunErrorMessage(
            error,
            translate(
              'auto.components.team.space.TeamMemberManagement.loadCodesError',
              'Invite codes require an updated Team Server'
            )
          )
        )
      }
    }
    setMembers(nextMembers)
    setInviteCodes(nextCodes)
  }, [canManage, organizationId])

  useEffect(() => {
    if (!active) {
      return
    }
    void load().catch((error) =>
      toast.error(
        teamRunErrorMessage(
          error,
          translate(
            'auto.components.team.space.TeamMemberManagement.loadError',
            'Unable to load Team members'
          )
        )
      )
    )
  }, [active, load])

  const createInviteCode = async () => {
    if (!organizationId) {
      return
    }
    setCreatingCode(true)
    try {
      const created = await window.api.teamRun.organizations.createInviteCode(organizationId)
      setLatestCode(created.code)
      await load()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMemberManagement.createCodeError',
          'Unable to create invite code'
        )
      )
    } finally {
      setCreatingCode(false)
    }
  }

  const copyInviteCode = async () => {
    await window.api.clipboard.writeText(latestCode)
    toast.success(
      translate('auto.components.team.space.TeamMemberManagement.codeCopied', 'Invite code copied')
    )
  }

  const revokeInviteCode = async (inviteCodeId: string) => {
    if (!organizationId) {
      return
    }
    try {
      await window.api.teamRun.organizations.revokeInviteCode({ organizationId, inviteCodeId })
      await load()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMemberManagement.revokeCodeError',
          'Unable to revoke invite code'
        )
      )
    }
  }

  const updateRole = async (userId: string, role: 'admin' | 'member') => {
    if (!organizationId) {
      return
    }
    try {
      await window.api.teamRun.organizations.updateMemberRole({ organizationId, userId, role })
      await load()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamMemberManagement.updateRoleError',
          'Unable to update member role'
        )
      )
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
          'auto.components.team.space.TeamMemberManagement.removeError',
          'Unable to remove member'
        )
      )
    }
  }

  return (
    <div className="min-h-0 space-y-4">
      {canManage ? (
        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">
                {translate(
                  'auto.components.team.space.TeamMemberManagement.inviteTitle',
                  'One-time invite code'
                )}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {translate(
                  'auto.components.team.space.TeamMemberManagement.inviteDescription',
                  'The code expires in 7 days and adds one person as a Member.'
                )}
              </p>
            </div>
            <Button onClick={() => void createInviteCode()} disabled={creatingCode}>
              <KeyRound />
              {creatingCode
                ? translate(
                    'auto.components.team.space.TeamMemberManagement.creatingCode',
                    'Creating…'
                  )
                : translate(
                    'auto.components.team.space.TeamMemberManagement.createCode',
                    'Create code'
                  )}
            </Button>
          </div>
          {latestCode ? (
            <div className="flex gap-2">
              <Input value={latestCode} readOnly aria-label={inviteCodeLabel()} />
              <Button variant="outline" onClick={() => void copyInviteCode()}>
                <Copy />
                {translate('auto.components.team.space.TeamMemberManagement.copy', 'Copy')}
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            {inviteCodes.map((inviteCode) => (
              <div
                key={inviteCode.id}
                className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TeamMemberManagement.codeEnding',
                    'Code ending in {{value0}} · expires {{value1}}',
                    {
                      value0: inviteCode.codeHint,
                      value1: new Date(inviteCode.expiresAt).toLocaleDateString()
                    }
                  )}
                </span>
                <Badge variant={inviteCode.status === 'active' ? 'secondary' : 'outline'}>
                  {inviteCodeStatusLabel(inviteCode.status)}
                </Badge>
                {inviteCode.status === 'active' ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate(
                      'auto.components.team.space.TeamMemberManagement.revokeCode',
                      'Revoke code ending in {{value0}}',
                      { value0: inviteCode.codeHint }
                    )}
                    onClick={() => void revokeInviteCode(inviteCode.id)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          {translate('auto.components.team.space.TeamMemberManagement.members', 'Members')}
        </h3>
        <div className="scrollbar-sleek max-h-72 space-y-2 overflow-y-auto">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{member.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{member.email}</div>
              </div>
              {canManage && member.role !== 'owner' ? (
                <Select
                  value={member.role}
                  onValueChange={(value) =>
                    void updateRole(member.userId, value as 'admin' | 'member')
                  }
                >
                  <SelectTrigger className="w-28" aria-label={roleLabel()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{memberRoleLabel('member')}</SelectItem>
                    <SelectItem value="admin">{memberRoleLabel('admin')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{memberRoleLabel(member.role)}</Badge>
              )}
              {canManage && member.role !== 'owner' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.team.space.TeamMemberManagement.removeMember',
                    'Remove {{value0}}',
                    { value0: member.displayName }
                  )}
                  onClick={() => void removeMember(member.userId)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function memberRoleLabel(role: OrganizationMember['role']): string {
  if (role === 'owner') {
    return translate('auto.components.team.space.TeamMemberManagement.roleOwner', 'Owner')
  }
  if (role === 'admin') {
    return translate('auto.components.team.space.TeamMemberManagement.roleAdmin', 'Admin')
  }
  return translate('auto.components.team.space.TeamMemberManagement.roleMember', 'Member')
}

function inviteCodeStatusLabel(status: TeamInviteCode['status']): string {
  const labels = {
    active: translate('auto.components.team.space.TeamMemberManagement.statusActive', 'Active'),
    redeemed: translate(
      'auto.components.team.space.TeamMemberManagement.statusRedeemed',
      'Redeemed'
    ),
    revoked: translate('auto.components.team.space.TeamMemberManagement.statusRevoked', 'Revoked'),
    expired: translate('auto.components.team.space.TeamMemberManagement.statusExpired', 'Expired')
  }
  return labels[status]
}

function inviteCodeLabel(): string {
  return translate('auto.components.team.space.TeamMemberManagement.inviteCode', 'Invite code')
}

function roleLabel(): string {
  return translate('auto.components.team.space.TeamMemberManagement.role', 'Role')
}
