import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'

export function GenericCliCommandConfirmation(props: {
  command: string
  confirmed: boolean
  onConfirmedChange: (confirmed: boolean) => void
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.team.space.GenericCliCommandConfirmation.commandLabel',
          'Command from this project'
        )}
      </p>
      <code className="mt-1 block break-all font-mono text-xs text-foreground">
        {props.command}
      </code>
      <label className="mt-3 flex items-center gap-2 text-xs">
        <Checkbox
          checked={props.confirmed}
          onCheckedChange={(value) => props.onConfirmedChange(value === true)}
        />
        {translate(
          'auto.components.team.space.GenericCliCommandConfirmation.confirm',
          'I trust this command to run on the selected execution host.'
        )}
      </label>
    </div>
  )
}
