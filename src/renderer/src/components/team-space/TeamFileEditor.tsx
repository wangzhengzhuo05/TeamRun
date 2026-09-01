import { useEffect, useState } from 'react'
import { FileWarning, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type {
  TeamFile,
  TeamFileVersion,
  TeamFileVersionContent
} from '../../../../shared/teamrun-api'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { base64ToText, supportsTeamFileText } from './team-file-content'
import { TeamDocumentAgentDialog } from './TeamDocumentAgentDialog'

type Props = {
  file: TeamFile
  versions: TeamFileVersion[]
  selectedVersion: TeamFileVersion | null
  content: TeamFileVersionContent | null
  saving: boolean
  authUserId: string | null
  canClearQuarantine: boolean
  canDelete: boolean
  onSelectVersion: (versionId: string) => void
  onSave: (content: string) => Promise<void>
  onProposalApplied: () => Promise<void>
  onClearQuarantine: () => Promise<void>
  onDelete: () => Promise<boolean>
}

export function TeamFileEditor(props: Props) {
  const [draft, setDraft] = useState('')
  const currentSelected = props.selectedVersion?.version === props.file.currentVersion
  const editable =
    currentSelected &&
    props.selectedVersion?.availability === 'available' &&
    supportsTeamFileText(props.file.currentMimeType)

  useEffect(() => {
    setDraft(props.content ? base64ToText(props.content.contentBase64) : '')
  }, [props.content])

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{props.file.path}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {props.file.currentMimeType} · {formatBytes(props.file.currentSizeBytes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={props.selectedVersion?.id ?? ''} onValueChange={props.onSelectVersion}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  {translate('auto.components.team.space.TeamFileEditor.version', 'Version')}{' '}
                  {version.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {props.canDelete ? <DeleteTeamFileButton onDelete={props.onDelete} /> : null}
        </div>
      </header>
      {props.selectedVersion?.availability === 'quarantined' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-border bg-card p-5 text-center shadow-xs">
            <FileWarning className="mx-auto size-7 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold">
              {translate(
                'auto.components.team.space.TeamFileEditor.quarantined',
                'File version quarantined'
              )}
            </h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {quarantineReason(props.selectedVersion.quarantineReason)}
            </p>
            {props.canClearQuarantine ? (
              <Button className="mt-4" size="sm" onClick={props.onClearQuarantine}>
                <ShieldCheck />
                {translate(
                  'auto.components.team.space.TeamFileEditor.clearQuarantine',
                  'Clear quarantine'
                )}
              </Button>
            ) : null}
          </div>
        </div>
      ) : props.content && supportsTeamFileText(props.content.mimeType) ? (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">SHA-256</Badge>
            <code className="min-w-0 truncate">{props.content.sha256}</code>
            {!currentSelected ? (
              <Badge variant="secondary">
                {translate(
                  'auto.components.team.space.TeamFileEditor.historical',
                  'Historical version'
                )}
              </Badge>
            ) : null}
          </div>
          <Textarea
            className="scrollbar-editor min-h-0 flex-1 resize-none font-mono"
            value={draft}
            readOnly={!editable}
            onChange={(event) => setDraft(event.target.value)}
          />
          {editable ? (
            <div className="mt-3 flex justify-end gap-2">
              {props.file.kind === 'document' && props.content ? (
                <TeamDocumentAgentDialog
                  authUserId={props.authUserId}
                  file={props.file}
                  onApplied={props.onProposalApplied}
                />
              ) : null}
              <Button disabled={props.saving} onClick={() => void props.onSave(draft)}>
                <Save />
                {props.saving
                  ? translate('auto.components.team.space.TeamFileEditor.saving', 'Saving…')
                  : translate(
                      'auto.components.team.space.TeamFileEditor.saveVersion',
                      'Save new version'
                    )}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamFileEditor.noPreview',
            'Preview is unavailable for this file type.'
          )}
        </div>
      )}
    </section>
  )
}

function DeleteTeamFileButton({ onDelete }: { onDelete: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const remove = async () => {
    if (await onDelete()) {
      setOpen(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate(
            'auto.components.team.space.TeamFileEditor.deleteLabel',
            'Delete Team File'
          )}
        >
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamFileEditor.deleteTitle',
              'Delete Team File?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamFileEditor.deleteDescription',
              'The file leaves the Team library. Existing frozen contexts keep their version references.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={() => void remove()}>
            {translate('auto.components.team.space.TeamFileEditor.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`
}

function quarantineReason(reason: string | null): string {
  if (reason === 'executable_content') {
    return translate(
      'auto.components.team.space.TeamFileEditor.executableContent',
      'Executable content requires Owner review.'
    )
  }
  if (reason === 'possible_secret') {
    return translate(
      'auto.components.team.space.TeamFileEditor.possibleSecret',
      'A possible secret requires Owner review.'
    )
  }
  return translate(
    'auto.components.team.space.TeamFileEditor.reviewRequired',
    'Owner review is required before preview or Agent context use.'
  )
}
