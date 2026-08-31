import { describe, expect, it } from 'vitest'
import mobilePairingPlugin from '../oxlint-plugins/mobile-pairing-qrcode-import.mjs'
import { lintSourceWithPlugins } from './run-js-plugin-lint.mjs'

function lintSource(source) {
  return lintSourceWithPlugins({
    filename: 'sample.ts',
    source,
    plugins: [{ name: 'mobile-pairing', plugin: mobilePairingPlugin }],
    rules: { 'mobile-pairing/no-eager-qrcode-import': 'error' }
  })
}

describe('mobile pairing qrcode import rule', () => {
  it('rejects eager runtime imports', () => {
    const diagnostics = lintSource("import QRCode from 'qrcode'\nvoid QRCode")

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'mobile-pairing(no-eager-qrcode-import)'
    ])
  })

  it('allows type-only and lazy imports', () => {
    expect(lintSource("import type QRCode from 'qrcode'\nlet qr: typeof QRCode")).toEqual([])
    expect(lintSource("const QRCode = await import('qrcode')\nvoid QRCode")).toEqual([])
  })
})
