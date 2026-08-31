import { File, FileCode2, FileText, Loader2, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { CreateTeamDocumentDialog } from './CreateTeamDocumentDialog'
import { TeamFileEditor } from './TeamFileEditor'
import { useTeamFiles } from './useTeamFiles'

type Props = {
  projectId: string | null
  authUserId: string | null
  eventRevision: number
  canManageTeam: boolean
  canDevelopTeam: boolean
}

export function TeamFilesPanel({
  projectId,
  authUserId,
  eventRevision,
  canManageTeam,
  canDevelopTeam
}: Props) {
  const files = useTeamFiles(projectId, eventRevision)
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    void files.upload(selected)
  }

  return (
    <div className="team-space-files grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-border bg-muted/15">
        <div className="space-y-2 border-b border-border p-3">
          <div>
            <h2 className="text-sm font-semibold">
              {translate('auto.components.team.space.TeamFilesPanel.title', 'Team Files')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamFilesPanel.description',
                'Versioned documents, code, and reference files'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <label aria-disabled={!projectId || files.saving}>
                {files.saving ? <Loader2 className="animate-spin" /> : <Upload />}
                {translate('auto.components.team.space.TeamFilesPanel.upload', 'Upload')}
                <input
                  className="hidden"
                  type="file"
                  multiple
                  disabled={!projectId || files.saving}
                  onChange={upload}
                />
              </label>
            </Button>
            <CreateTeamDocumentDialog
              disabled={!projectId || files.saving}
              onCreate={files.createDocument}
            />
          </div>
        </div>
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
          {files.loading ? (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : null}
          {files.files.map((file) => {
            const Icon =
              file.kind === 'document' ? FileText : file.kind === 'code' ? FileCode2 : File
            const selected = file.id === files.selectedFile?.id
            return (
              <button
                key={file.id}
                type="button"
                data-current={selected ? 'true' : undefined}
                className={cn(
                  'mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
                  selected ? 'bg-accent text-accent-foreground' : undefined
                )}
                onClick={() => files.selectFile(file.id)}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{file.path}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    v{file.currentVersion}
                  </span>
                </span>
                {file.currentAvailability === 'quarantined' ? (
                  <Badge variant="secondary">
                    {translate(
                      'auto.components.team.space.TeamFilesPanel.quarantined',
                      'Quarantined'
                    )}
                  </Badge>
                ) : null}
              </button>
            )
          })}
          {!files.loading && files.files.length === 0 ? (
            <p className="p-3 text-xs leading-5 text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamFilesPanel.empty',
                'Upload a file or create a Markdown document for the Team.'
              )}
            </p>
          ) : null}
        </div>
      </aside>
      {files.selectedFile ? (
        <TeamFileEditor
          file={files.selectedFile}
          versions={files.versions}
          selectedVersion={files.selectedVersion}
          content={files.content}
          saving={files.saving}
          authUserId={authUserId}
          canClearQuarantine={canManageTeam}
          canDelete={canDevelopTeam}
          onSelectVersion={files.selectVersion}
          onSave={files.saveTextVersion}
          onProposalApplied={files.refresh}
          onClearQuarantine={files.clearQuarantine}
          onDelete={files.deleteFile}
        />
      ) : (
        <main className="flex min-h-0 items-center justify-center text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamFilesPanel.noSelection',
            'Select a Team File to preview its versions.'
          )}
        </main>
      )}
    </div>
  )
}
