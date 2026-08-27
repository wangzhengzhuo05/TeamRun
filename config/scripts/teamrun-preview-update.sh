#!/usr/bin/env bash
set -euo pipefail

repository=${TEAMRUN_PREVIEW_GITHUB_REPOSITORY:-wangzhengzhuo05/TeamRun}
release_tag=${TEAMRUN_PREVIEW_RELEASE_TAG:-teamrun-preview-linux}
asset_name=${TEAMRUN_PREVIEW_ASSET_NAME:-teamrun-preview-linux-x64.AppImage}
manifest_name=${TEAMRUN_PREVIEW_MANIFEST_NAME:-teamrun-preview-linux-x64.manifest.json}
install_dir=${TEAMRUN_PREVIEW_INSTALL_DIR:-/opt/teamrun-preview}
service_name=${TEAMRUN_PREVIEW_SERVICE_NAME:-teamrun-preview.service}
profile_dir=${TEAMRUN_PREVIEW_PROFILE_DIR:-/home/ubuntu/.config/teamrun-preview-xdg/TeamRun}
legacy_profile_dir=${TEAMRUN_PREVIEW_LEGACY_PROFILE_DIR:-/home/ubuntu/.config/teamrun-preview}
health_url=${TEAMRUN_PREVIEW_HEALTH_URL:-https://preview.runteam.site/}
github_api=${TEAMRUN_PREVIEW_GITHUB_API_URL:-https://api.github.com}
github_token=${TEAMRUN_PREVIEW_GITHUB_TOKEN:-}
rollback_count=${TEAMRUN_PREVIEW_ROLLBACK_COUNT:-2}

[[ $EUID -eq 0 ]] || { echo 'The preview updater must run as root' >&2; exit 1; }
[[ $repository =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid GitHub repository' >&2; exit 1; }
[[ $release_tag =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid preview release tag' >&2; exit 1; }
[[ $asset_name =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid preview asset name' >&2; exit 1; }
[[ $manifest_name =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid preview manifest name' >&2; exit 1; }
[[ $service_name =~ ^[A-Za-z0-9@_.-]+\.service$ ]] || { echo 'Invalid systemd service name' >&2; exit 1; }
[[ $install_dir == /opt/* && $install_dir != /opt ]] || { echo 'Install directory must be below /opt' >&2; exit 1; }
[[ $profile_dir == /home/*/.config/* && $profile_dir != /home ]] || { echo 'Invalid preview profile directory' >&2; exit 1; }
[[ $legacy_profile_dir == /home/*/.config/* && $legacy_profile_dir != /home ]] || { echo 'Invalid legacy profile directory' >&2; exit 1; }
[[ $rollback_count =~ ^[1-9]$|^10$ ]] || { echo 'Rollback count must be between 1 and 10' >&2; exit 1; }

install -d -o root -g root -m 755 "$install_dir"
exec 9>"$install_dir/update.lock"
flock -n 9 || exit 0

staging_dir=$(mktemp -d "$install_dir/.update.XXXXXX")
release_json=$staging_dir/release.json
manifest_path=$staging_dir/$manifest_name
appimage_path=$staging_dir/$asset_name
current_appimage=$install_dir/$asset_name
current_app_dir=$install_dir/current
previous_app_dir=$install_dir/.previous-appdir
deployed_manifest=$install_dir/$manifest_name
deployed_commit=$install_dir/DEPLOYED_COMMIT
rollbacks_dir=$install_dir/rollbacks
promoted=0
runtime_moved=0
created_profile=0
needs_recovery=0
rollback_dir=
rollback_new=
profile_stage=$profile_dir.migrating
service_user=$(systemctl show "$service_name" -p User --value)
service_user=${service_user:-root}

extract_appimage() {
  local image_path=$1
  local target_dir=$2
  local extraction_root
  extraction_root=$(mktemp -d "$install_dir/.extract.XXXXXX")
  if ! (cd "$extraction_root" && "$image_path" --appimage-extract >/dev/null); then
    rm -rf -- "$extraction_root"
    return 1
  fi
  if [[ ! -x $extraction_root/squashfs-root/AppRun ]]; then
    rm -rf -- "$extraction_root"
    echo 'Extracted preview runtime has no executable AppRun' >&2
    return 1
  fi
  chmod -R u=rwX,go=rX "$extraction_root/squashfs-root"
  mv "$extraction_root/squashfs-root" "$target_dir"
  rmdir "$extraction_root"
}

runtime_is_executable() {
  runuser --user "$service_user" -- test -x "$current_app_dir/AppRun"
}

service_runs_current_runtime() {
  local main_pid runtime_path
  main_pid=$(systemctl show "$service_name" -p MainPID --value)
  [[ $main_pid =~ ^[1-9][0-9]*$ ]] || return 1
  runtime_path=$(readlink -f "/proc/$main_pid/exe") || return 1
  [[ $runtime_path == "$current_app_dir/"* ]]
}

restore_previous_deployment() {
  local backup_dir=$rollback_dir
  [[ -d $backup_dir ]] || backup_dir=$rollback_new
  systemctl stop "$service_name" || true
  if ((promoted || runtime_moved)); then
    rm -rf -- "$current_app_dir"
    if [[ -d $previous_app_dir ]]; then
      mv "$previous_app_dir" "$current_app_dir"
    elif [[ -f $backup_dir/$asset_name ]]; then
      extract_appimage "$backup_dir/$asset_name" "$current_app_dir" || true
    fi
  fi
  if ((promoted)); then
    if [[ -f $backup_dir/$asset_name ]]; then
      cp -a "$backup_dir/$asset_name" "$current_appimage.recovering"
      mv -f "$current_appimage.recovering" "$current_appimage"
    else
      rm -f -- "$current_appimage"
    fi
    if [[ -f $backup_dir/$manifest_name ]]; then
      cp -a "$backup_dir/$manifest_name" "$deployed_manifest.recovering"
      mv -f "$deployed_manifest.recovering" "$deployed_manifest"
    else
      rm -f -- "$deployed_manifest"
    fi
    if [[ -f $backup_dir/DEPLOYED_COMMIT ]]; then
      cp -a "$backup_dir/DEPLOYED_COMMIT" "$deployed_commit.recovering"
      mv -f "$deployed_commit.recovering" "$deployed_commit"
    else
      rm -f -- "$deployed_commit"
    fi
    if [[ -f $backup_dir/profile.tgz ]]; then
      rm -rf -- "$profile_dir"
      tar xzf "$backup_dir/profile.tgz" -C "$(dirname "$profile_dir")"
    elif ((created_profile)); then
      rm -rf -- "$profile_dir"
    fi
  elif ((created_profile)); then
    rm -rf -- "$profile_dir"
  fi
  rm -rf -- "$profile_stage"
  systemctl reset-failed "$service_name" || true
  systemctl start "$service_name" || true
}

finish() {
  local exit_status=$?
  trap - EXIT
  if ((exit_status != 0 && needs_recovery)); then
    echo 'Restoring the previous TeamRun preview deployment' >&2
    restore_previous_deployment
  fi
  rm -rf -- "$staging_dir"
  exit "$exit_status"
}
trap finish EXIT

curl_args=(-fsSL --retry 3 --connect-timeout 10 --max-time 180 -H 'Accept: application/vnd.github+json')
asset_curl_args=(-fsSL --retry 3 --connect-timeout 10 --max-time 600 -H 'Accept: application/octet-stream')
if [[ -n $github_token ]]; then
  [[ $github_token =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Invalid GitHub token format' >&2; exit 1; }
  auth_config=$staging_dir/curl-auth.conf
  printf 'header = "Authorization: Bearer %s"\n' "$github_token" > "$auth_config"
  chmod 600 "$auth_config"
  curl_args+=(--config "$auth_config")
  asset_curl_args+=(--config "$auth_config")
fi

curl "${curl_args[@]}" "$github_api/repos/$repository/releases/tags/$release_tag" -o "$release_json"
manifest_url=$(jq -er --arg name "$manifest_name" '.assets[] | select(.name == $name) | .url' "$release_json")
appimage_url=$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .url' "$release_json")
curl "${asset_curl_args[@]}" "$manifest_url" -o "$manifest_path"

jq -e \
  --arg asset "$asset_name" \
  '.schemaVersion == 1 and .channel == "preview" and .artifact.name == $asset and (.commit | test("^[0-9a-f]{40}$")) and (.artifact.sha256 | test("^[0-9a-f]{64}$")) and (.artifact.size | type == "number" and . > 0)' \
  "$manifest_path" >/dev/null
next_commit=$(jq -er '.commit' "$manifest_path")
expected_sha256=$(jq -er '.artifact.sha256' "$manifest_path")
expected_size=$(jq -er '.artifact.size' "$manifest_path")

if runtime_is_executable && [[ -f $deployed_commit ]] && [[ $(<"$deployed_commit") == "$next_commit" ]]; then
  echo "TeamRun preview is already at $next_commit"
  exit 0
fi

curl "${asset_curl_args[@]}" "$appimage_url" -o "$appimage_path"
[[ $(stat -c '%s' "$appimage_path") == "$expected_size" ]] || { echo 'Preview asset size mismatch' >&2; exit 1; }
printf '%s  %s\n' "$expected_sha256" "$appimage_path" | sha256sum --check --status
file_info=$(LC_ALL=C file "$appimage_path")
grep -q 'ELF .* executable' <<<"$file_info"
grep -q 'x86-64' <<<"$file_info"
chmod 755 "$appimage_path"
extracted_app_dir=$staging_dir/appdir
extract_appimage "$appimage_path" "$extracted_app_dir"

install -d -o root -g root -m 700 "$rollbacks_dir"
rollback_new=$rollbacks_dir/$(date -u +%Y%m%dT%H%M%SZ)-$next_commit.new
rollback_dir=${rollback_new%.new}.ready
install -d -o root -g root -m 700 "$rollback_new"
if [[ -f $current_appimage ]]; then
  cp -a "$current_appimage" "$rollback_new/$asset_name"
fi
if [[ -f $deployed_manifest ]]; then
  cp -a "$deployed_manifest" "$rollback_new/$manifest_name"
fi
if [[ -f $deployed_commit ]]; then
  cp -a "$deployed_commit" "$rollback_new/DEPLOYED_COMMIT"
fi
if [[ -L $profile_dir ]]; then
  echo "Refusing symlinked preview profile: $profile_dir" >&2
  exit 1
fi
[[ ! -L $current_app_dir ]] || { echo "Refusing symlinked preview runtime: $current_app_dir" >&2; exit 1; }
[[ ! -L $previous_app_dir ]] || { echo "Refusing symlinked previous runtime: $previous_app_dir" >&2; exit 1; }

health_since=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
needs_recovery=1
systemctl stop "$service_name"
if [[ -d $profile_dir ]]; then
  tar czf "$rollback_new/profile.tgz" -C "$(dirname "$profile_dir")" "$(basename "$profile_dir")"
fi

if [[ ! -e $profile_dir && -d $legacy_profile_dir ]]; then
  install -d -o ubuntu -g ubuntu -m 700 "$(dirname "$profile_dir")"
  rm -rf -- "$profile_stage"
  cp -a "$legacy_profile_dir" "$profile_stage"
  mv "$profile_stage" "$profile_dir"
  created_profile=1
  chown -R ubuntu:ubuntu "$profile_dir"
fi

rm -rf -- "$previous_app_dir"
if [[ -d $current_app_dir ]]; then
  mv "$current_app_dir" "$previous_app_dir"
  runtime_moved=1
fi
mv "$rollback_new" "$rollback_dir"
promoted=1
mv "$appimage_path" "$current_appimage"
mv "$extracted_app_dir" "$current_app_dir"
cp "$manifest_path" "$deployed_manifest.new"
printf '%s\n' "$next_commit" > "$deployed_commit.new"
chmod 644 "$deployed_manifest.new" "$deployed_commit.new"
mv "$deployed_manifest.new" "$deployed_manifest"
mv "$deployed_commit.new" "$deployed_commit"

systemctl reset-failed "$service_name"
systemctl start "$service_name"

healthy=0
for _ in $(seq 1 45); do
  if systemctl is-active --quiet "$service_name" && \
    service_runs_current_runtime && \
    curl -fsS --connect-timeout 3 --max-time 5 "$health_url" >/dev/null && \
    journalctl -u "$service_name" --since "$health_since" -o cat --no-pager | \
      jq -Rse 'split("\n") | map(fromjson? | select(.type == "orca_server_ready" and .schemaVersion == 1)) | length > 0' >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done

if ((healthy == 0)); then
  echo 'Preview health check failed' >&2
  exit 1
fi

needs_recovery=0
rm -rf -- "$previous_app_dir"

mapfile -d '' rollback_entries < <(
  find "$rollbacks_dir" -mindepth 1 -maxdepth 1 -type d -name '*.ready' -printf '%T@ %p\0' | sort -z -n
)
excess=$((${#rollback_entries[@]} - rollback_count))
for ((index = 0; index < excess; index++)); do
  old_rollback=${rollback_entries[$index]#* }
  [[ $old_rollback == "$rollbacks_dir"/* && $old_rollback != "$rollbacks_dir" ]] || exit 1
  rm -rf -- "$old_rollback"
done

echo "Deployed TeamRun preview commit $next_commit"
