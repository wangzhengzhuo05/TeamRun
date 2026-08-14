import { useEffect, useRef } from 'react'
import {
  canMintMobilePairingOffer,
  type MobilePairingConnectionMode
} from '../../../../shared/mobile-pairing-connection-mode'

type MutableRef<T> = { current: T }

/**
 * Keeps the displayed pairing QR consistent with the selected path and Relay
 * backend. Losing Relay clears the QR (Step 2 does not re-mint a local-only
 * code under the Relay label), restoring it mints Relay, and a path
 * change (local or cross-window) invalidates the encoded policy — otherwise the
 * shown code silently mismatches what it actually encodes.
 */
export function useMobilePairingQrInvalidation(params: {
  connectionMode: MobilePairingConnectionMode
  relayAvailable: boolean
  relayConfigurationKey: string
  pairLoading: boolean
  hasGeneratedRef: MutableRef<boolean>
  pairingRequestIdRef: MutableRef<number>
  setPairQrDataUrl: (value: string | null) => void
  setPairingUrl: (value: string | null) => void
  setPairingQrError: (value: boolean) => void
  setPairLoading: (value: boolean) => void
  setRelayMintFailure?: (value: null) => void
  regenerate: (mode: MobilePairingConnectionMode, opts: { rotate: boolean }) => void
}): void {
  const {
    connectionMode,
    relayAvailable,
    relayConfigurationKey,
    pairLoading,
    hasGeneratedRef,
    pairingRequestIdRef,
    setPairQrDataUrl,
    setPairingUrl,
    setPairingQrError,
    setPairLoading,
    setRelayMintFailure,
    regenerate
  } = params
  const previousRelayRef = useRef({ available: relayAvailable, key: relayConfigurationKey })
  // Tracks the mode we last acted on so the mode effect can tell a cross-window
  // preference sync apart from an already-handled change.
  const handledModeRef = useRef(connectionMode)

  // Relay backend or availability changes clear the old QR without degrading
  // to LAN. If the selected backend is ready, rotate onto that backend. Clear
  // loading too so a superseded in-flight generate can't leave a stuck spinner.
  useEffect(() => {
    const previous = previousRelayRef.current
    previousRelayRef.current = { available: relayAvailable, key: relayConfigurationKey }
    if (
      connectionMode !== 'automatic' ||
      !hasGeneratedRef.current ||
      (previous.available === relayAvailable && previous.key === relayConfigurationKey)
    ) {
      return
    }
    pairingRequestIdRef.current += 1
    hasGeneratedRef.current = false
    setPairingUrl(null)
    setPairingQrError(false)
    setPairQrDataUrl(null)
    setRelayMintFailure?.(null)
    if (relayAvailable && canMintMobilePairingOffer({ connectionMode, relayAvailable })) {
      // Why: a QR pins its Relay provider; a backend or availability change
      // must mint a fresh invite instead of retaining the old provider.
      regenerate(connectionMode, { rotate: true })
    } else {
      setPairLoading(false)
    }
  }, [
    connectionMode,
    relayAvailable,
    relayConfigurationKey,
    hasGeneratedRef,
    pairingRequestIdRef,
    setPairQrDataUrl,
    setPairingUrl,
    setPairingQrError,
    setPairLoading,
    setRelayMintFailure,
    regenerate
  ])

  // Any path change — a user pick or another window persisting a new default —
  // invalidates the prior request before rotating so a late response cannot
  // restore a QR for the old policy. No updateSettings here (the caller/other
  // window already wrote it) so there is no cross-window loop.
  // Why: remint only when the new path may honestly encode a QR. Switching into
  // unavailable Anywhere must clear, not mint a local-only code under Relay.
  useEffect(() => {
    if (connectionMode === handledModeRef.current) {
      return
    }
    handledModeRef.current = connectionMode
    pairingRequestIdRef.current += 1
    const shouldRegenerate = hasGeneratedRef.current || pairLoading
    hasGeneratedRef.current = false
    setPairingUrl(null)
    setPairingQrError(false)
    setPairQrDataUrl(null)
    setRelayMintFailure?.(null)
    if (shouldRegenerate && canMintMobilePairingOffer({ connectionMode, relayAvailable })) {
      // Why: no rotate here — the main process rotates exactly once when the
      // requested mode differs from the pending token's minted mode, so the
      // initiating window and windows reacting to a cross-window preference
      // sync converge on the same fresh token instead of racing rotations.
      regenerate(connectionMode, { rotate: false })
    } else {
      // No honest re-mint (blocked path or nothing pending); drop spinner.
      setPairLoading(false)
    }
  }, [
    connectionMode,
    relayAvailable,
    pairLoading,
    hasGeneratedRef,
    pairingRequestIdRef,
    setPairQrDataUrl,
    setPairingUrl,
    setPairingQrError,
    setPairLoading,
    setRelayMintFailure,
    regenerate
  ])
}
