#!/usr/bin/env bash
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo 'Run this installer with sudo' >&2; exit 1; }

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
install -d -o root -g root -m 755 /opt/teamrun-preview /usr/local/libexec
install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/.config/teamrun-preview-xdg
install -o root -g root -m 755 "$repo_root/config/scripts/teamrun-preview-launch.sh" /usr/local/libexec/teamrun-preview-launch
install -o root -g root -m 755 "$repo_root/config/scripts/teamrun-preview-update.sh" /usr/local/libexec/teamrun-preview-update
install -o root -g root -m 644 "$repo_root/config/systemd/teamrun-preview.service" /etc/systemd/system/teamrun-preview.service
install -o root -g root -m 644 "$repo_root/config/systemd/teamrun-preview-update.service" /etc/systemd/system/teamrun-preview-update.service
install -o root -g root -m 644 "$repo_root/config/systemd/teamrun-preview-update.timer" /etc/systemd/system/teamrun-preview-update.timer

if [[ ! -f /etc/teamrun/preview-update.env ]]; then
  install -d -o root -g root -m 755 /etc/teamrun
  printf '%s\n' \
    'TEAMRUN_PREVIEW_GITHUB_REPOSITORY=wangzhengzhuo05/TeamRun' \
    'TEAMRUN_PREVIEW_GITHUB_TOKEN=' \
    > /etc/teamrun/preview-update.env
  chmod 600 /etc/teamrun/preview-update.env
fi

systemctl daemon-reload
systemctl enable teamrun-preview.service

echo 'Installed the pull-deployment units.'
echo 'Add a fine-grained GitHub token with Contents: read to /etc/teamrun/preview-update.env.'
echo 'After the preview release exists, enable the timer with:'
echo '  systemctl enable --now teamrun-preview-update.timer'
echo '  systemctl start teamrun-preview-update.service'
