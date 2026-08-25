# TeamRun shared-key pilot deployment

The pilot stack runs TeamRun API, PostgreSQL, MinIO, and Caddy. Caddy is the only public service and provisions HTTPS automatically. OIDC/SSO is not required while `TEAMRUN_SHARED_KEY` is configured.

## Deploy

1. Point a DNS name at the server and allow inbound TCP 80/443 and UDP 443.
2. Copy `config/teamrun/production.env.example` to a root-owned file outside the repository and replace every placeholder with random values.
3. Run:

   ```bash
   docker compose --env-file /etc/teamrun/teamrun.env \
     -f config/teamrun/production.compose.yaml up -d --build
   ```

4. Verify `https://<TEAMRUN_DOMAIN>/health` and `https://<TEAMRUN_DOMAIN>/v1/auth/config`.

In Team Space, enter that HTTPS address and the configured team key. The legacy `ORCA_*` environment names and on-disk paths remain compatibility-only so older clients and existing profiles can upgrade safely.
