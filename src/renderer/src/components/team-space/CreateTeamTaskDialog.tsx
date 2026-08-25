import { useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import type { CreateTaskRequest, Repository } from '../../../../shared/teamrun-api'
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
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  repositories: Repository[]
  disabled: boolean
  onCreate: (input: CreateTaskRequest) => Promise<void>
}

export function CreateTeamTaskDialog({ repositories, disabled, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repositoryId, setRepositoryId] = useState<string>('none')
  const [sourceUrl, setSourceUrl] = useState('')
  const [externalId, setExternalId] = useState('')
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'linear' | 'jira'>('github')

  const submit = async () => {
    const input: CreateTaskRequest = {
      title: title.trim(),
      descriptionMarkdown: description.trim(),
      repositoryId: repositoryId === 'none' ? null : repositoryId
    }
    if (importing) {
      input.externalSource = {
        provider,
        externalId: externalId.trim(),
        url: sourceUrl.trim(),
        importedMarkdown: description.trim()
      }
    }
    try {
      await onCreate(input)
      setOpen(false)
      setTitle('')
      setDescription('')
      setSourceUrl('')
      setExternalId('')
    } catch (error) {
      const queued = reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.CreateTeamTaskDialog.4d2561e655',
          'Unable to create task'
        )
      )
      if (queued) {
        setOpen(false)
        setTitle('')
        setDescription('')
        setSourceUrl('')
        setExternalId('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <DialogTrigger asChild>
          <Button size="sm" disabled={disabled} onClick={() => setImporting(false)}>
            <Plus />{' '}
            {translate('auto.components.team.space.CreateTeamTaskDialog.ce3b2e873b', 'New task')}
          </Button>
        </DialogTrigger>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setImporting(true)}
          >
            <ExternalLink />{' '}
            {translate('auto.components.team.space.CreateTeamTaskDialog.a14fd02010', 'Import')}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {importing
              ? translate(
                  'auto.components.team.space.CreateTeamTaskDialog.a53fedb076',
                  'Import task'
                )
              : translate(
                  'auto.components.team.space.CreateTeamTaskDialog.f1c06c09a8',
                  'Create task'
                )}
          </DialogTitle>
          <DialogDescription>
            {importing
              ? translate(
                  'auto.components.team.space.CreateTeamTaskDialog.58bcd92bc3',
                  'Capture the external source as immutable imported Markdown.'
                )
              : translate(
                  'auto.components.team.space.CreateTeamTaskDialog.1122f643b7',
                  'Add a shared unit of work for the team.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {importing ? (
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <div className="space-y-2">
                <Label>
                  {translate(
                    'auto.components.team.space.CreateTeamTaskDialog.f767ec8c43',
                    'Provider'
                  )}
                </Label>
                <Select
                  value={provider}
                  onValueChange={(value) => setProvider(value as typeof provider)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">
                      {translate(
                        'auto.components.team.space.CreateTeamTaskDialog.0ee6092632',
                        'GitHub'
                      )}
                    </SelectItem>
                    <SelectItem value="gitlab">
                      {translate(
                        'auto.components.team.space.CreateTeamTaskDialog.f755a3e0c0',
                        'GitLab'
                      )}
                    </SelectItem>
                    <SelectItem value="linear">
                      {translate(
                        'auto.components.team.space.CreateTeamTaskDialog.daaa6de2ec',
                        'Linear'
                      )}
                    </SelectItem>
                    <SelectItem value="jira">
                      {translate(
                        'auto.components.team.space.CreateTeamTaskDialog.5d4d54a8e7',
                        'Jira'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamrun-external-id">
                  {translate(
                    'auto.components.team.space.CreateTeamTaskDialog.76b0bd5a45',
                    'External ID'
                  )}
                </Label>
                <Input
                  id="teamrun-external-id"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          {importing ? (
            <div className="space-y-2">
              <Label htmlFor="teamrun-source-url">
                {translate(
                  'auto.components.team.space.CreateTeamTaskDialog.fe3962ddf8',
                  'Source URL'
                )}
              </Label>
              <Input
                id="teamrun-source-url"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="teamrun-task-title">
              {translate('auto.components.team.space.CreateTeamTaskDialog.0d659a107c', 'Title')}
            </Label>
            <Input
              id="teamrun-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamrun-task-description">
              {translate(
                'auto.components.team.space.CreateTeamTaskDialog.5051fda5bc',
                'Description'
              )}
            </Label>
            <Textarea
              id="teamrun-task-description"
              className="min-h-36"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {translate(
                'auto.components.team.space.CreateTeamTaskDialog.7db079e9cf',
                'Repository'
              )}
            </Label>
            <Select value={repositoryId} onValueChange={setRepositoryId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {translate(
                    'auto.components.team.space.CreateTeamTaskDialog.4408774de4',
                    'No repository'
                  )}
                </SelectItem>
                {repositories.map((repository) => (
                  <SelectItem key={repository.id} value={repository.id}>
                    {repository.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!title.trim() || (importing && (!sourceUrl || !externalId))}
            onClick={submit}
          >
            {importing
              ? translate('auto.components.team.space.CreateTeamTaskDialog.a14fd02010', 'Import')
              : translate('auto.components.team.space.CreateTeamTaskDialog.a1d97b95bd', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
