import { useCallback, useEffect, useState } from 'react'
import type {
  MobileRelayConfiguration,
  UpdateMobileRelayConfiguration
} from '../../../../shared/mobile-relay-configuration'
import {
  isMobileRelayAvailable,
  mobileRelayConfigurationKey
} from '../../../../shared/mobile-relay-configuration'

export function useMobileRelayConfiguration(signedInToOrca: boolean): {
  configuration: MobileRelayConfiguration | null
  relayAvailable: boolean
  relayConfigurationKey: string
  saveConfiguration: (update: UpdateMobileRelayConfiguration) => Promise<MobileRelayConfiguration>
} {
  const [configuration, setConfiguration] = useState<MobileRelayConfiguration | null>(null)

  useEffect(() => {
    let active = true
    const mobileApi = window.api.mobile
    const unsubscribe = mobileApi.onRelayConfigurationChanged
      ? mobileApi.onRelayConfigurationChanged((next) => {
          if (active) {
            setConfiguration(next)
          }
        })
      : () => {}
    if (!mobileApi.getRelayConfiguration) {
      return () => {
        active = false
        unsubscribe()
      }
    }
    void mobileApi
      .getRelayConfiguration()
      .then((next) => {
        if (active) {
          setConfiguration(next)
        }
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const saveConfiguration = useCallback(async (update: UpdateMobileRelayConfiguration) => {
    const saved = await window.api.mobile.setRelayConfiguration(update)
    setConfiguration(saved)
    return saved
  }, [])

  const relayAvailable = isMobileRelayAvailable(configuration, signedInToOrca)
  return {
    configuration,
    relayAvailable,
    relayConfigurationKey: mobileRelayConfigurationKey(configuration, relayAvailable),
    saveConfiguration
  }
}
