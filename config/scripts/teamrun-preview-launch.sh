#!/usr/bin/env bash
set -euo pipefail

appimage=${TEAMRUN_PREVIEW_APPIMAGE_PATH:-/opt/teamrun-preview/teamrun-preview-linux-x64.AppImage}
source_launcher=${TEAMRUN_PREVIEW_SOURCE_LAUNCHER:-/home/ubuntu/TeamRun-feat-init-demo/config/scripts/orca-dev}
project_root=${TEAMRUN_PREVIEW_PROJECT_ROOT:-/home/ubuntu/TeamRun-feat-init-demo}
port=${TEAMRUN_PREVIEW_PORT:-6768}
pairing_address=${TEAMRUN_PREVIEW_PAIRING_ADDRESS:-https://preview.runteam.site}

args=(serve --port "$port" --pairing-address "$pairing_address" --project-root "$project_root" --json)

if [[ -x "$appimage" ]]; then
  exec "$appimage" "${args[@]}"
fi

if [[ -x "$source_launcher" ]]; then
  exec "$source_launcher" "${args[@]}"
fi

echo "Neither the preview AppImage nor the source fallback is executable" >&2
exit 1
