import { useEffect, useState } from 'react'
import { LogIn, UsersRound } from 'lucide-react'
import type { TeamRunAuthStatus, TeamRunSignInArgs } from '../../../../shared/teamrun-cloud'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

type Props = {
  auth: Exclude<TeamRunAuthStatus, { state: 'signed-in' }> | null
  loading: boolean
  onSignIn: (args: TeamRunSignInArgs) => Promise<void>
}

export function TeamSpaceSignIn({ auth, loading, onSignIn }: Props) {
  const [devEmail, setDevEmail] = useState('developer@teamrun.local')
  const [apiUrl, setApiUrl] = useState(auth?.apiUrl ?? '')
  const [sharedKey, setSharedKey] = useState('')
  const devAuth = auth?.devAuth === true
  const sharedKeyAuth =
    auth?.sharedKeyAuth === true || auth?.state === 'unconfigured' || auth?.state === 'error'

  useEffect(() => {
    if (auth?.apiUrl) setApiUrl(auth.apiUrl)
  }, [auth?.apiUrl])

  return (
    <div className="flex h-full items-center justify-center p-8">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UsersRound className="size-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {translate('auto.components.team.space.TeamSpaceSignIn.fa4609f5ef', 'Team Space')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamSpaceSignIn.faa629364a',
            'Coordinate shared tasks and publish only the agent result you choose.'
          )}
        </p>
        {auth?.state === 'unconfigured' ? (
          <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamSpaceSignIn.0e33e1cf3a',
              'Enter your TeamRun service address and team key.'
            )}
          </div>
        ) : null}
        {auth?.state === 'error' ? (
          <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {auth.message}
          </div>
        ) : null}
        {devAuth ? (
          <div className="mt-5 space-y-2">
            <Label htmlFor="teamrun-dev-email">
              {translate(
                'auto.components.team.space.TeamSpaceSignIn.15b961f735',
                'Development email'
              )}
            </Label>
            <Input
              id="teamrun-dev-email"
              type="email"
              value={devEmail}
              onChange={(event) => setDevEmail(event.target.value)}
            />
          </div>
        ) : null}
        {sharedKeyAuth ? (
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamrun-service-url">
                {translate(
                  'auto.components.team.space.TeamSpaceSignIn.serviceUrl',
                  'Service address'
                )}
              </Label>
              <Input
                id="teamrun-service-url"
                type="url"
                value={apiUrl}
                placeholder={translate(
                  'auto.components.team.space.TeamSpaceSignIn.serviceUrlPlaceholder',
                  'https://teamrun.example.com'
                )}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setApiUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamrun-shared-key">
                {translate('auto.components.team.space.TeamSpaceSignIn.teamKey', 'Team key')}
              </Label>
              <Input
                id="teamrun-shared-key"
                type="password"
                value={sharedKey}
                autoComplete="current-password"
                onChange={(event) => setSharedKey(event.target.value)}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamSpaceSignIn.keyHint',
                'Use the HTTPS address and team key shared by your TeamRun administrator.'
              )}
            </p>
          </div>
        ) : null}
        <Button
          className="mt-5 w-full"
          disabled={loading || (sharedKeyAuth && (!apiUrl.trim() || !sharedKey.trim()))}
          onClick={() =>
            onSignIn(
              devAuth ? { devEmail } : sharedKeyAuth ? { apiUrl: apiUrl.trim(), sharedKey } : {}
            )
          }
        >
          <LogIn />
          {loading
            ? translate('auto.components.team.space.TeamSpaceSignIn.68590386ad', 'Connecting…')
            : devAuth
              ? translate(
                  'auto.components.team.space.TeamSpaceSignIn.f20be4afdc',
                  'Continue in development'
                )
              : sharedKeyAuth
                ? translate(
                    'auto.components.team.space.TeamSpaceSignIn.connectKey',
                    'Connect with team key'
                  )
                : translate(
                    'auto.components.team.space.TeamSpaceSignIn.60b94b9191',
                    'Sign in with SSO'
                  )}
        </Button>
      </section>
    </div>
  )
}
