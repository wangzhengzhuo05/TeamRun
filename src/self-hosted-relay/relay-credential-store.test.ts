import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RelayCredentialStore } from './relay-credential-store'

describe('RelayCredentialStore', () => {
  const directories: string[] = []

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not consume invite attempts during an availability preview', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-relay-credentials-'))
    directories.push(directory)
    const store = new RelayCredentialStore(join(directory, 'state.json'))
    const invite = store.createInvite('relay-host-id', 'phone-1')

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(store.authorize('relay-host-id', invite.token, Date.now(), false)?.kind).toBe('invite')
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(store.authorize('relay-host-id', invite.token)?.kind).toBe('invite')
    }
    expect(store.authorize('relay-host-id', invite.token)).toBeNull()
  })
})
