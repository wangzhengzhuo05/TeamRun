import { redactString } from '../observability/redactor'

export function redactTeamServerDevelopmentOutput(
  value: string,
  sensitiveValues: string[]
): string {
  return redactString(
    sensitiveValues.reduce(
      (output, sensitive) =>
        sensitive ? output.replaceAll(sensitive, '[redacted:model-key]') : output,
      value
    )
  )
}
