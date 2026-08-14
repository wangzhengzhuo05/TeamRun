import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  MobileRelayBackend,
  MobileRelayConfiguration,
  UpdateMobileRelayConfiguration
} from '../../../../shared/mobile-relay-configuration'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

function canonicalHttpsOrigin(value: string): string | null {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
      ? parsed.origin
      : null
  } catch {
    return null
  }
}

export function MobileRelayServerDialog({
  configuration,
  saveConfiguration
}: {
  configuration: MobileRelayConfiguration | null
  saveConfiguration: (update: UpdateMobileRelayConfiguration) => Promise<MobileRelayConfiguration>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [backend, setBackend] = useState<MobileRelayBackend>('orca')
  const [serverUrl, setServerUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setBackend(configuration?.backend ?? 'orca')
    setServerUrl(configuration?.serverUrl ?? '')
    setAccessToken('')
    setError(null)
  }, [configuration, open])

  const normalizedServerUrl = canonicalHttpsOrigin(serverUrl)
  const requiresAccessToken =
    backend === 'self-hosted' &&
    (!configuration?.configured || configuration.serverUrl !== normalizedServerUrl)
  const invalidServerUrl = backend === 'self-hosted' && !normalizedServerUrl
  const invalidAccessToken = accessToken.trim().length > 0 && accessToken.trim().length < 32
  const saveDisabled =
    saving ||
    invalidServerUrl ||
    invalidAccessToken ||
    (requiresAccessToken && accessToken.trim().length === 0)

  async function save(): Promise<void> {
    if (saveDisabled) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveConfiguration(
        backend === 'orca'
          ? { backend: 'orca' }
          : {
              backend: 'self-hosted',
              serverUrl: serverUrl.trim(),
              ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {})
            }
      )
      setOpen(false)
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : String(saveError)
      setError(
        code.includes('secure_storage')
          ? translate(
              'auto.components.settings.MobileRelayServerDialog.secureStorageError',
              'Secure credential storage is unavailable on this computer.'
            )
          : translate(
              'auto.components.settings.MobileRelayServerDialog.saveError',
              'Could not save the Relay server configuration.'
            )
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="xs">
          {configuration?.backend === 'self-hosted'
            ? translate(
                'auto.components.settings.MobileRelayServerDialog.configure',
                'Configure server'
              )
            : translate(
                'auto.components.settings.MobileRelayServerDialog.selfHosted',
                'Use self-hosted Relay'
              )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.MobileRelayServerDialog.title', 'Relay server')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.MobileRelayServerDialog.description',
              'Use Orca Relay with your account, or route encrypted mobile traffic through a server you operate.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mobile-relay-backend">
              {translate('auto.components.settings.MobileRelayServerDialog.provider', 'Provider')}
            </Label>
            <Select
              value={backend}
              onValueChange={(value) => setBackend(value as MobileRelayBackend)}
            >
              <SelectTrigger id="mobile-relay-backend">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orca">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.orcaRelay',
                    'Orca Relay'
                  )}
                </SelectItem>
                <SelectItem value="self-hosted">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.privateRelay',
                    'Self-hosted Relay'
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {backend === 'self-hosted' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="mobile-relay-server-url">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.serverUrl',
                    'Server URL'
                  )}
                </Label>
                <Input
                  id="mobile-relay-server-url"
                  inputMode="url"
                  placeholder={translate(
                    'auto.components.settings.MobileRelayServerDialog.serverUrlPlaceholder',
                    'https://relay.example.com'
                  )}
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  aria-invalid={invalidServerUrl || undefined}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.serverUrlHelp',
                    'Use the public HTTPS origin configured on your Relay reverse proxy.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile-relay-access-key">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.accessKey',
                    'Access key'
                  )}
                </Label>
                <Input
                  id="mobile-relay-access-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    configuration?.credentialStored &&
                    configuration.serverUrl === normalizedServerUrl
                      ? translate(
                          'auto.components.settings.MobileRelayServerDialog.savedKey',
                          'Saved — leave blank to keep it'
                        )
                      : ''
                  }
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.MobileRelayServerDialog.accessKeyHelp',
                    'At least 32 characters; stored with operating system credential encryption and never included in pairing codes.'
                  )}
                </p>
              </div>
              <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.MobileRelayServerDialog.repairWarning',
                  'Phones paired through another Relay provider must be paired again after this change.'
                )}
              </p>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {backend === 'self-hosted' && configuration?.credentialError ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'auto.components.settings.MobileRelayServerDialog.savedCredentialError',
                'The saved Relay access key is unavailable. Enter it again to reconnect.'
              )}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={saving}>
              {translate('auto.components.settings.MobileRelayServerDialog.cancel', 'Cancel')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void save()} disabled={saveDisabled}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {translate('auto.components.settings.MobileRelayServerDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
