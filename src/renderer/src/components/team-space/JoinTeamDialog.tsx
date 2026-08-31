import { useState } from 'react'
import { LogIn } from 'lucide-react'
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
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  onJoin: (code: string) => Promise<void>
}

export function JoinTeamDialog({ onJoin }: Props) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)

  const join = async () => {
    if (!code.trim()) {
      return
    }
    setJoining(true)
    try {
      await onJoin(code.trim())
      setCode('')
      setOpen(false)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate('auto.components.team.space.JoinTeamDialog.joinError', 'Unable to join Team')
      )
    } finally {
      setJoining(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <LogIn />
          {translate('auto.components.team.space.JoinTeamDialog.joinTeam', 'Join Team')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.team.space.JoinTeamDialog.title', 'Join a Team')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.JoinTeamDialog.description',
              'Enter a one-time invite code from the Team Owner. You will join as a Member.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="team-invite-code">
            {translate('auto.components.team.space.JoinTeamDialog.code', 'Invite code')}
          </Label>
          <Input
            id="team-invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="TR-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void join()
              }
            }}
          />
        </div>
        <DialogFooter showCloseButton>
          <Button disabled={!code.trim() || joining} onClick={() => void join()}>
            {joining
              ? translate('auto.components.team.space.JoinTeamDialog.joining', 'Joining…')
              : translate('auto.components.team.space.JoinTeamDialog.join', 'Join')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
