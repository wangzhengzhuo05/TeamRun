# TeamRun Preview Pull Deployment

The preview server does not build TypeScript. GitHub Actions packages the x64
AppImage, publishes it to the mutable `teamrun-preview-linux` prerelease, and
records the exact source commit and artifact checksum in a JSON manifest.

The server polls GitHub over outbound HTTPS. A successful update requires all of
the following before it is accepted:

- the manifest schema, commit, asset name, size, and SHA-256 are valid;
- the downloaded file is an x86-64 ELF executable;
- `teamrun-preview.service` reaches the versioned `orca_server_ready` contract;
- `https://preview.runteam.site/` responds successfully.

If startup or either health check fails, the updater restores the prior
AppImage, deployment metadata, and TeamRun profile snapshot. The first update
copies the current dev preview profile into the packaged app's isolated XDG
configuration root, leaving the original profile intact as a source fallback.

## One-time GitHub setup

The workflow is `.github/workflows/teamrun-preview-linux.yml`. It runs on pushes
to `feat-init-demo` and can also be dispatched manually once the workflow exists
on GitHub's default branch.

For a private repository, create a fine-grained personal access token with:

- repository access limited to `wangzhengzhuo05/TeamRun`;
- repository permission `Contents: Read-only`;
- an explicit expiration date.

Do not paste the token into a shell command. Open the root-only environment file:

```bash
sudoedit /etc/teamrun/preview-update.env
```

Set `TEAMRUN_PREVIEW_GITHUB_TOKEN` to the token value. The file must remain mode
`0600`. The updater passes the credential through a root-only temporary curl
configuration, so it does not appear in process arguments or logs.

The workflow itself uses GitHub's built-in `GITHUB_TOKEN`. Repository Actions
settings must allow workflows to write repository contents so it can create and
replace preview release assets.

## Install on the server

```bash
sudo bash config/scripts/install-teamrun-preview-pull-deployment.sh
```

The installed launcher prefers `/opt/teamrun-preview/teamrun-preview-linux-x64.AppImage`.
Until that file exists, it launches the current source-built runtime, allowing
the systemd units to be installed before the first CI build completes.

After the first `TeamRun preview Linux` workflow run publishes the prerelease:

```bash
sudo systemctl enable --now teamrun-preview-update.timer
sudo systemctl start teamrun-preview-update.service
```

## Verify

```bash
sudo systemctl status teamrun-preview.service --no-pager
sudo systemctl status teamrun-preview-update.timer --no-pager
sudo journalctl -u teamrun-preview-update.service -n 50 --no-pager
sudo cat /opt/teamrun-preview/DEPLOYED_COMMIT
```

The timer checks every ten minutes with up to one minute of randomized delay.
An unchanged commit is a no-op. Two complete rollback generations are retained
under `/opt/teamrun-preview/rollbacks/`.
