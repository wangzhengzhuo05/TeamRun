import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = parse(readFileSync('.github/workflows/teamrun-preview-linux.yml', 'utf8'))
const launchScript = readFileSync('config/scripts/teamrun-preview-launch.sh', 'utf8')
const updateScript = readFileSync('config/scripts/teamrun-preview-update.sh', 'utf8')
const updateService = readFileSync('config/systemd/teamrun-preview-update.service', 'utf8')
const updateTimer = readFileSync('config/systemd/teamrun-preview-update.timer', 'utf8')

describe('TeamRun preview pull deployment contract', () => {
  it('builds preview pushes in GitHub Actions and publishes immutable commit metadata', () => {
    expect(workflow.on.push.branches).toContain('feat-init-demo')
    expect(workflow.concurrency['cancel-in-progress']).toBe(true)
    const steps = workflow.jobs['build-and-publish'].steps
    expect(steps.find((step) => step.name === 'Validate source').run).toBe('pnpm run typecheck')
    expect(steps.find((step) => step.name === 'Package preview AppImage').run).toContain(
      '--linux AppImage --x64 --publish never'
    )
    expect(steps.find((step) => step.name === 'Create deployment manifest').run).toContain(
      '--arg commit "$GITHUB_SHA"'
    )
  })

  it('keeps extracted, previous, and source runtimes available in fallback order', () => {
    expect(launchScript).toContain('if [[ -x "$app_run" ]]')
    expect(launchScript).toContain('if [[ -x "$previous_app_run" ]]')
    expect(launchScript).toContain('if [[ -x "$source_launcher" ]]')
  })

  it('extracts without FUSE and verifies the artifact and deployed runtime', () => {
    expect(updateScript).toContain('sha256sum --check --status')
    expect(updateScript).toContain("grep -q 'ELF .* executable'")
    expect(updateScript).toContain('--appimage-extract')
    expect(updateScript).toContain('squashfs-root/AppRun')
    expect(updateScript).toContain('chmod -R u=rwX,go=rX')
    expect(updateScript).toContain('service_runs_current_runtime')
    expect(updateScript).toContain('.type == "orca_server_ready" and .schemaVersion == 1')
    expect(updateScript).toContain('curl -fsS --connect-timeout 3 --max-time 5 "$health_url"')
    expect(updateScript).toContain('restore_previous_deployment')
    expect(updateScript).toContain('curl-auth.conf')
    expect(updateScript).not.toContain('-H "Authorization: Bearer $github_token"')
  })

  it('runs the root updater with a narrow writable filesystem surface', () => {
    expect(updateService).toContain('ProtectSystem=strict')
    expect(updateService).toContain('ProtectHome=read-only')
    expect(updateService).toContain(
      'ReadWritePaths=/opt/teamrun-preview /home/ubuntu/.config/teamrun-preview-xdg'
    )
    expect(updateTimer).toContain('OnUnitActiveSec=10min')
    expect(updateTimer).toContain('RandomizedDelaySec=1min')
  })
})
