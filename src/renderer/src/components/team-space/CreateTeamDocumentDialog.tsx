import { useState } from 'react'
import { FilePlus2 } from 'lucide-react'
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

type Props = {
  disabled: boolean
  onCreate: (path: string, content: string) => Promise<boolean>
}

export function CreateTeamDocumentDialog({ disabled, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [content, setContent] = useState('')

  const create = async () => {
    const normalizedPath = path.trim().endsWith('.md') ? path.trim() : `${path.trim()}.md`
    if (!(await onCreate(normalizedPath, content))) {
      return
    }
    setPath('')
    setContent('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <FilePlus2 />
          {translate(
            'auto.components.team.space.CreateTeamDocumentDialog.newDocument',
            'New document'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.CreateTeamDocumentDialog.title',
              'Create Team Document'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.CreateTeamDocumentDialog.description',
              'Markdown documents are shared with every Team member and keep immutable versions.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-file-path">
              {translate(
                'auto.components.team.space.CreateTeamDocumentDialog.path',
                'Document path'
              )}
            </Label>
            <Input
              id="team-file-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder={translate(
                'auto.components.team.space.CreateTeamDocumentDialog.pathPlaceholder',
                'docs/meeting-notes.md'
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-file-content">
              {translate(
                'auto.components.team.space.CreateTeamDocumentDialog.content',
                'Markdown content'
              )}
            </Label>
            <Textarea
              id="team-file-content"
              className="min-h-48 font-mono"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!path.trim()} onClick={() => void create()}>
            {translate(
              'auto.components.team.space.CreateTeamDocumentDialog.create',
              'Create document'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
