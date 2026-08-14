import { useEffect, useRef } from 'react'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'

export function useMobileRelayPairingInvalidation(options: {
  connectionMode: MobilePairingConnectionMode
  relayConfigurationKey: string
  invalidatePairing: () => void
}): void {
  const { connectionMode, relayConfigurationKey, invalidatePairing } = options
  const previousKeyRef = useRef(relayConfigurationKey)

  useEffect(() => {
    const previousKey = previousKeyRef.current
    previousKeyRef.current = relayConfigurationKey
    // Why: an existing QR remains bound to the Relay that minted it.
    if (previousKey !== relayConfigurationKey && connectionMode === 'automatic') {
      invalidatePairing()
    }
  }, [connectionMode, invalidatePairing, relayConfigurationKey])
}
