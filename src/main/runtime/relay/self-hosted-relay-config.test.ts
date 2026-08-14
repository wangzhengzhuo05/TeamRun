import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(),
  getSelectedStorageBackend: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn()
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

import {
  readActiveSelfHostedRelayConfig,
  readMobileRelayConfiguration,
  saveMobileRelayConfiguration
} from './self-hosted-relay-config'

describe('self-hosted Relay configuration', () => {
  const directories: string[] = []
  const accessToken = 'private-access-key-that-is-long-enough'

  beforeEach(() => {
    safeStorageMock.isEncryptionAvailable.mockReset().mockReturnValue(true)
    safeStorageMock.getSelectedStorageBackend.mockReset().mockReturnValue('gnome_libsecret')
    safeStorageMock.encryptString
      .mockReset()
      .mockImplementation((value: string) => Buffer.from(`encrypted:${value}`, 'utf8'))
    safeStorageMock.decryptString
      .mockReset()
      .mockImplementation((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''))
  })

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function userDataPath(): string {
    const directory = mkdtempSync(join(tmpdir(), 'orca-relay-config-'))
    directories.push(directory)
    return directory
  }

  it('defaults to Orca Relay', () => {
    expect(readMobileRelayConfiguration(userDataPath())).toEqual({
      backend: 'orca',
      serverUrl: null,
      configured: true,
      credentialStored: false,
      revision: 0
    })
  })

  it('encrypts a self-hosted key and accepts a trailing origin slash', () => {
    const path = userDataPath()
    const saved = saveMobileRelayConfiguration(path, {
      backend: 'self-hosted',
      serverUrl: 'https://relay.example.test/',
      accessToken
    })

    expect(saved).toMatchObject({
      backend: 'self-hosted',
      serverUrl: 'https://relay.example.test',
      configured: true,
      credentialStored: true,
      revision: 1
    })
    expect(readActiveSelfHostedRelayConfig(path)).toMatchObject({
      serverUrl: 'https://relay.example.test',
      accessToken
    })
    expect(readFileSync(join(path, 'mobile-relay-config.json'), 'utf8')).not.toContain(accessToken)
  })

  it('retains a saved key only for the unchanged origin', () => {
    const path = userDataPath()
    saveMobileRelayConfiguration(path, {
      backend: 'self-hosted',
      serverUrl: 'https://relay.example.test',
      accessToken
    })

    expect(
      saveMobileRelayConfiguration(path, {
        backend: 'self-hosted',
        serverUrl: 'https://relay.example.test/'
      })
    ).toMatchObject({ configured: true, revision: 2 })
    expect(() =>
      saveMobileRelayConfiguration(path, {
        backend: 'self-hosted',
        serverUrl: 'https://other.example.test'
      })
    ).toThrow('self_hosted_relay_access_key_required')
  })

  it('requires HTTPS and operating-system credential encryption', () => {
    const path = userDataPath()
    expect(() =>
      saveMobileRelayConfiguration(path, {
        backend: 'self-hosted',
        serverUrl: 'http://relay.example.test',
        accessToken
      })
    ).toThrow('self_hosted_relay_url_must_be_https_origin')

    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    expect(() =>
      saveMobileRelayConfiguration(path, {
        backend: 'self-hosted',
        serverUrl: 'https://relay.example.test',
        accessToken
      })
    ).toThrow('self_hosted_relay_secure_storage_unavailable')
  })

  it.runIf(process.platform === 'linux')('rejects Electron basic_text storage', () => {
    safeStorageMock.getSelectedStorageBackend.mockReturnValue('basic_text')
    expect(() =>
      saveMobileRelayConfiguration(userDataPath(), {
        backend: 'self-hosted',
        serverUrl: 'https://relay.example.test',
        accessToken
      })
    ).toThrow('self_hosted_relay_secure_storage_unavailable')
  })

  it('fails closed when private configuration is corrupt or cannot be decrypted', () => {
    const path = userDataPath()
    writeFileSync(join(path, 'mobile-relay-config.json'), '{broken', 'utf8')
    expect(readMobileRelayConfiguration(path)).toMatchObject({
      backend: 'self-hosted',
      configured: false,
      credentialError: 'The saved Relay configuration could not be read.'
    })

    saveMobileRelayConfiguration(path, {
      backend: 'self-hosted',
      serverUrl: 'https://relay.example.test',
      accessToken
    })
    safeStorageMock.decryptString.mockImplementation(() => {
      throw new Error('keychain unavailable')
    })
    expect(readMobileRelayConfiguration(path)).toMatchObject({
      backend: 'self-hosted',
      configured: false,
      credentialStored: true
    })
    expect(readActiveSelfHostedRelayConfig(path)).toBeNull()
  })
})
