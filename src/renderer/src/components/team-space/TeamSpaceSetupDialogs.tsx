import { useState } from 'react'
import { FolderGit2, Plus, UsersRound } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

function failure(error: unknown): boolean {
  return reportTeamRunMutation(
    error,
    translate('auto.components.team.space.TeamSpaceSetupDialogs.fe6cecad53', 'Unable to save')
  )
}

type OrganizationDialogProps = {
  onCreate: (slug: string, name: string) => Promise<void>
  compact?: boolean
}

export function CreateOrganizationDialog({ onCreate, compact = false }: OrganizationDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const submit = async () => {
    try {
      await onCreate(slug.trim(), name.trim())
      setOpen(false)
      setName('')
      setSlug('')
    } catch (error) {
      if (failure(error)) {
        setOpen(false)
        setName('')
        setSlug('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size="sm"
          className={compact ? 'w-full justify-start' : undefined}
        >
          <UsersRound />{' '}
          {translate(
            'auto.components.team.space.TeamSpaceSetupDialogs.e460bbbd46',
            'New organization'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.eb0815af66',
              'Create organization'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.77c1f39568',
              'Organizations own projects, tasks, and membership.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamrun-org-name">
              {translate('auto.components.team.space.TeamSpaceSetupDialogs.642efa6af4', 'Name')}
            </Label>
            <Input id="teamrun-org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamrun-org-slug">
              {translate('auto.components.team.space.TeamSpaceSetupDialogs.24af1baa2a', 'Slug')}
            </Label>
            <Input
              id="teamrun-org-slug"
              placeholder={translate(
                'auto.components.team.space.TeamSpaceSetupDialogs.588010c812',
                'product-team'
              )}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || !slug.trim()} onClick={submit}>
            {translate('auto.components.team.space.TeamSpaceSetupDialogs.ff5efeb011', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ProjectDialogProps = {
  disabled: boolean
  onCreate: (key: string, name: string, contextMarkdown: string) => Promise<void>
  compact?: boolean
}

export function CreateProjectDialog({ disabled, onCreate, compact = false }: ProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [context, setContext] = useState('')

  const submit = async () => {
    try {
      await onCreate(key.trim().toUpperCase(), name.trim(), context.trim())
      setOpen(false)
      setKey('')
      setName('')
      setContext('')
    } catch (error) {
      if (failure(error)) {
        setOpen(false)
        setKey('')
        setName('')
        setContext('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size="sm"
          className={compact ? 'w-full justify-start' : undefined}
          disabled={disabled}
        >
          <Plus />{' '}
          {translate('auto.components.team.space.TeamSpaceSetupDialogs.ae1a7d6d76', 'New project')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.dda244e421',
              'Create project'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.0abca8d22c',
              'Project context is included in new task snapshots.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <div className="space-y-2">
            <Label htmlFor="teamrun-project-key">
              {translate('auto.components.team.space.TeamSpaceSetupDialogs.ce4518e34c', 'Key')}
            </Label>
            <Input
              id="teamrun-project-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamrun-project-name">
              {translate('auto.components.team.space.TeamSpaceSetupDialogs.642efa6af4', 'Name')}
            </Label>
            <Input
              id="teamrun-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="teamrun-project-context">
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.78dd10486d',
              'Shared context'
            )}
          </Label>
          <Textarea
            id="teamrun-project-context"
            className="min-h-28"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button disabled={!key.trim() || !name.trim()} onClick={submit}>
            {translate('auto.components.team.space.TeamSpaceSetupDialogs.ff5efeb011', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RepositoryDialogProps = {
  disabled: boolean
  compact?: boolean
  onCreate: (input: {
    provider: 'github' | 'gitlab' | 'other'
    remoteUrl: string
    displayName: string
    defaultBranch: string
  }) => Promise<void>
}

export function CreateRepositoryDialog({
  disabled,
  onCreate,
  compact = false
}: RepositoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')

  const submit = async () => {
    try {
      let host = ''
      try {
        host = new URL(remoteUrl).hostname.toLowerCase()
      } catch {
        host = remoteUrl.match(/@([^:]+):/)?.[1]?.toLowerCase() ?? ''
      }
      const provider = host.includes('github')
        ? 'github'
        : host.includes('gitlab')
          ? 'gitlab'
          : 'other'
      await onCreate({ provider, remoteUrl, displayName, defaultBranch })
      setOpen(false)
      setRemoteUrl('')
      setDisplayName('')
    } catch (error) {
      if (failure(error)) {
        setOpen(false)
        setRemoteUrl('')
        setDisplayName('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size="sm"
          className={compact ? 'w-full justify-start' : undefined}
          disabled={disabled}
        >
          <FolderGit2 />{' '}
          {translate(
            'auto.components.team.space.TeamSpaceSetupDialogs.5c7025d090',
            'Add repository'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.30be4e02e7',
              'Connect repository'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamSpaceSetupDialogs.39a7aa3782',
              'The provider is detected from the HTTPS remote URL.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamrun-repo-url">
              {translate(
                'auto.components.team.space.TeamSpaceSetupDialogs.9bbfcdb2f7',
                'Remote URL'
              )}
            </Label>
            <Input
              id="teamrun-repo-url"
              type="url"
              placeholder={translate(
                'auto.components.team.space.TeamSpaceSetupDialogs.1b1b42ce0b',
                'https://gitlab.example/team/repo.git'
              )}
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamrun-repo-name">
              {translate(
                'auto.components.team.space.TeamSpaceSetupDialogs.98b6c3b9ea',
                'Display name'
              )}
            </Label>
            <Input
              id="teamrun-repo-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamrun-repo-branch">
              {translate(
                'auto.components.team.space.TeamSpaceSetupDialogs.f2accfcc64',
                'Default branch'
              )}
            </Label>
            <Input
              id="teamrun-repo-branch"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!remoteUrl || !displayName || !defaultBranch} onClick={submit}>
            {translate('auto.components.team.space.TeamSpaceSetupDialogs.49e78f6731', 'Connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
