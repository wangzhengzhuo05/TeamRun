#!/usr/bin/env bash
set -euo pipefail

app_run=${TEAMRUN_PREVIEW_APP_RUN_PATH:-/opt/teamrun-preview/current/AppRun}
previous_app_run=${TEAMRUN_PREVIEW_PREVIOUS_APP_RUN_PATH:-/opt/teamrun-preview/.previous-appdir/AppRun}
source_launcher=${TEAMRUN_PREVIEW_SOURCE_LAUNCHER:-/home/ubuntu/TeamRun-feat-init-demo/config/scripts/orca-dev}
project_root=${TEAMRUN_PREVIEW_PROJECT_ROOT:-/home/ubuntu/TeamRun-feat-init-demo}
port=${TEAMRUN_PREVIEW_PORT:-6768}
pairing_address=${TEAMRUN_PREVIEW_PAIRING_ADDRESS:-https://preview.runteam.site}

args=(serve --port "$port" --pairing-address "$pairing_address" --project-root "$project_root" --json)

if [[ -x "$app_run" ]]; then
  exec "$app_run" "${args[@]}"
fi

if [[ -x "$previous_app_run" ]]; then
  exec "$previous_app_run" "${args[@]}"
fi

if [[ -x "$source_launcher" ]]; then
  exec "$source_launcher" "${args[@]}"
fi

echo "Neither the extracted preview runtime nor the source fallback is executable" >&2
exit 1
