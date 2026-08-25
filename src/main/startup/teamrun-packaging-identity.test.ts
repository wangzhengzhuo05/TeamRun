import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function asset(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('TeamRun packaging identity', () => {
  it('keeps the Linux desktop identity aligned with the packaged product', () => {
    const identity = JSON.parse(asset('config/teamrun/product-identity.json')) as {
      desktopName: string
    }
    expect(identity.desktopName).toBe('teamrun.desktop')
    expect(asset('config/electron-builder.config.cjs')).toContain('syncDesktopName: true')
  })

  it('ships native launchers with the TeamRun CLI identity', () => {
    for (const path of ['resources/linux/bin/teamrun', 'resources/darwin/bin/teamrun']) {
      const launcher = asset(path)
      expect(launcher).toContain('out/cli/teamrun.js')
      expect(launcher).toContain('TEAMRUN_CLI_COMMAND=teamrun')
    }
    expect(asset('resources/win32/bin/teamrun.cmd')).toContain('set "TEAMRUN_CLI_COMMAND=teamrun"')
  })

  it('registers and removes only the TeamRun Linux command', () => {
    const install = asset('resources/linux/packaging/after-install.sh')
    const remove = asset('resources/linux/packaging/after-remove.sh')
    expect(install).toContain('link="/usr/bin/teamrun"')
    expect(install).toContain('/opt/TeamRun')
    expect(remove).toContain('link="/usr/bin/teamrun"')
    expect(remove).toContain('/opt/TeamRun/*')
  })
})
