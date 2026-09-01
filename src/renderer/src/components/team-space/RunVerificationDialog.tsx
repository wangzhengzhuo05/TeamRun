import { useEffect, useState } from 'react'
import { Play, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRun } from '../../../../shared/teamrun-api'
import type { TeamRunVerificationCommand } from '../../../../shared/orca-yaml-hook-types'
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
import { translate } from '@/i18n/i18n'
import { teamRunErrorMessage } from './teamrun-error-message'

type Props = {
  run: AgentRun
  onCompleted: () => Promise<void>
}

export function RunVerificationDialog({ run, onCompleted }: Props) {
  const [open, setOpen] = useState(false)
  const [commands, setCommands] = useState<TeamRunVerificationCommand[]>([])
  const [commandId, setCommandId] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    void window.api.teamRun.runs
      .listVerificationCommands(run.clientRunId)
      .then((next) => {
        setCommands(next)
        setCommandId(next[0]?.id ?? '')
      })
      .catch((error) =>
        toast.error(
          teamRunErrorMessage(
            error,
            translate(
              'auto.components.team.space.RunVerificationDialog.2233ed5f42',
              'Unable to load checks'
            )
          )
        )
      )
  }, [open, run.clientRunId])

  const selected = commands.find((command) => command.id === commandId) ?? null
  const execute = async () => {
    if (!selected) {
      return
    }
    setRunning(true)
    try {
      const result = await window.api.teamRun.runs.runVerification({
        runId: run.id,
        clientRunId: run.clientRunId,
        commandId: selected.id
      })
      toast[result.exitCode === 0 ? 'success' : 'error'](
        translate(
          'auto.components.team.space.RunVerificationDialog.completed',
          '{{label}} exited with code {{code}}.',
          { label: selected.label, code: result.exitCode }
        )
      )
      await onCompleted()
      setOpen(false)
    } catch (error) {
      toast.error(
        teamRunErrorMessage(
          error,
          translate(
            'auto.components.team.space.RunVerificationDialog.11e06d9d92',
            'Verification failed'
          )
        )
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck />{' '}
          {translate('auto.components.team.space.RunVerificationDialog.a06986eb0b', 'Verify')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.RunVerificationDialog.b6b18d20bc',
              'Run trusted verification'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.RunVerificationDialog.7fa4b32a1c',
              'This command runs in the agent workspace. Its output stays on this device until you publish it.'
            )}
          </DialogDescription>
        </DialogHeader>
        {commands.length > 0 ? (
          <>
            <Select value={commandId} onValueChange={setCommandId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {commands.map((command) => (
                  <SelectItem key={command.id} value={command.id}>
                    {command.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <pre className="scrollbar-sleek max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {selected?.command}
            </pre>
          </>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.RunVerificationDialog.fc08d07145',
              'Add commands under'
            )}
            <code>
              {translate(
                'auto.components.team.space.RunVerificationDialog.b50048cf94',
                'scripts.verify'
              )}
            </code>{' '}
            {translate(
              'auto.components.team.space.RunVerificationDialog.600a450bcd',
              'in teamrun.yaml.'
            )}
          </div>
        )}
        <DialogFooter>
          <Button disabled={!selected || running} onClick={execute}>
            <Play />{' '}
            {running
              ? translate('auto.components.team.space.RunVerificationDialog.3303b7eed3', 'Running…')
              : translate(
                  'auto.components.team.space.RunVerificationDialog.76851c311a',
                  'Run command'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
