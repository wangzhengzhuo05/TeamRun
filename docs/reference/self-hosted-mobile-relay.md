# Self-hosted Mobile Relay

Orca can route its end-to-end encrypted mobile connection through a Relay you
operate. This mode does not use an Orca account or the Orca Relay service. The
existing mobile app needs no server setting: every pairing code carries the
selected Relay's public URL.

Self-hosting changes the transport operator, not the encryption boundary. The
Relay forwards opaque E2EE frames and cannot read terminal, agent, file, or RPC
contents. It can still observe connection metadata such as timing, byte counts,
the Relay host ID, and paired-device IDs.

## Requirements

- A public domain with HTTPS and WebSocket support.
- Node.js 20 or Docker on the server.
- One Relay process/replica; the bundled server is intentionally single-node.
- A randomly generated access key of at least 32 characters.
- Persistent storage for `relay-state.json`; losing it requires phones to pair
  again.
- An operating-system credential store on the desktop. On Linux, configure
  libsecret or KWallet; Electron's unencrypted `basic_text` backend is rejected.

The Relay binds to loopback by default. Terminate TLS in a reverse proxy and
forward HTTP plus WebSocket upgrades to `127.0.0.1:8787`. The public URL must be
a canonical HTTPS origin such as `https://relay.example.com`, with no path.

## Build and run

From an Orca source checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build:self-hosted-relay
```

Generate an access key without sending it to another service:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url') + '\n')"
```

Run directly behind your reverse proxy:

```bash
ORCA_RELAY_PUBLIC_URL=https://relay.example.com \
ORCA_RELAY_ACCESS_TOKEN=replace-with-generated-key \
ORCA_RELAY_DATA_PATH=/var/lib/orca-relay/relay-state.json \
node out/self-hosted-relay/server.cjs
```

Or build the included container after building the bundle:

```bash
export ORCA_RELAY_PUBLIC_URL=https://relay.example.com
export ORCA_RELAY_ACCESS_TOKEN=replace-with-generated-key
docker compose -f config/docker/self-hosted-relay/compose.example.yml up -d --build
```

The health endpoint is `GET /healthz`. A minimal nginx location is:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Do not expose port 8787 directly to the internet without TLS. Keep the access
key out of proxy logs, shell history, and source control. Back up the state file
with mode `0600` and rotate the access key if it is disclosed.

## Connect Orca Desktop

1. Open **Settings → Mobile**.
2. Under **Relay server**, choose **Use self-hosted Relay**.
3. Enter the public HTTPS origin and access key, then save.
4. Wait for the Relay status to become **Ready**, generate a new QR code, and
   pair the phone.

Switching between Orca Relay and a self-hosted Relay does not migrate server-side
resume credentials. Pair phones again after changing providers. LAN/Tailscale
pairing remains available and does not require any Relay or account.

## Environment variables

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `ORCA_RELAY_PUBLIC_URL` | Yes | — | Public canonical HTTPS origin embedded in pairing offers. |
| `ORCA_RELAY_ACCESS_TOKEN` | Yes | — | Desktop-to-Relay shared access key, 32–8192 characters. |
| `ORCA_RELAY_HOST` | No | `127.0.0.1` | Listener bind host. Use `0.0.0.0` in a container. |
| `ORCA_RELAY_PORT` | No | `8787` | Listener port behind the reverse proxy. |
| `ORCA_RELAY_DATA_PATH` | No | `data/relay-state.json` | Persistent invite and resume-credential state. |
| `ORCA_RELAY_MAX_CONNECTIONS` | No | `128` | Concurrent phone connection limit. |
