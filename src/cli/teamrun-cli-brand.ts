export function brandTeamRunCliText(text: string): string {
  if (process.env.TEAMRUN_CLI_COMMAND !== 'teamrun') {
    return text
  }
  return text
    .replace(/Orca/g, 'TeamRun')
    .replace(/(^|[\s`'$])orca(?:-ide|-dev)?(?=(?:\s|$|[.`]))/gm, '$1teamrun')
    .replace(/\ban TeamRun\b/g, 'a TeamRun')
    .replace(/\bname:orca\b/g, 'name:teamrun')
    .replace(/\/orca(?=\/)/g, '/teamrun')
}
