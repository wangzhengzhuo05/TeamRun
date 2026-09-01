#!/usr/bin/env bash
set -euo pipefail

repository=${TEAMRUN_API_GITHUB_REPOSITORY:-wangzhengzhuo05/TeamRun}
release_tag=${TEAMRUN_API_RELEASE_TAG:-teamrun-api-preview}
asset_name=${TEAMRUN_API_ASSET_NAME:-teamrun-api-preview.tar.gz}
manifest_name=${TEAMRUN_API_MANIFEST_NAME:-teamrun-api-preview.manifest.json}
image_name=${TEAMRUN_API_IMAGE_NAME:-teamrun-api:preview}
install_dir=${TEAMRUN_API_INSTALL_DIR:-/opt/teamrun-api-preview}
compose_file=${TEAMRUN_API_COMPOSE_FILE:-/home/ubuntu/TeamRun-feat-init-demo/config/teamrun/production.compose.yaml}
environment_file=${TEAMRUN_API_ENV_FILE:-/etc/teamrun/teamrun.env}
health_url=${TEAMRUN_API_HEALTH_URL:-https://teamrun.43-167-197-32.nip.io/health}
github_api=${TEAMRUN_API_GITHUB_API_URL:-https://api.github.com}
github_token=${TEAMRUN_API_GITHUB_TOKEN:-}

[[ $EUID -eq 0 ]] || { echo 'The TeamRun API updater must run as root' >&2; exit 1; }
[[ $repository =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid GitHub repository' >&2; exit 1; }
[[ $release_tag =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid API release tag' >&2; exit 1; }
[[ $asset_name =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid API asset name' >&2; exit 1; }
[[ $manifest_name =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid API manifest name' >&2; exit 1; }
[[ $image_name =~ ^[a-z0-9][a-z0-9._/-]*:[a-z0-9][a-z0-9._-]*$ ]] || { echo 'Invalid API image name' >&2; exit 1; }
[[ $install_dir == /opt/* && $install_dir != /opt ]] || { echo 'Install directory must be below /opt' >&2; exit 1; }
[[ -f $compose_file && ! -L $compose_file ]] || { echo 'Compose file is missing or symlinked' >&2; exit 1; }
[[ -f $environment_file && ! -L $environment_file ]] || { echo 'Environment file is missing or symlinked' >&2; exit 1; }

install -d -o root -g root -m 755 "$install_dir"
exec 9>"$install_dir/update.lock"
flock -n 9 || exit 0

staging_dir=$(mktemp -d "$install_dir/.update.XXXXXX")
release_json=$staging_dir/release.json
manifest_path=$staging_dir/$manifest_name
archive_path=$staging_dir/$asset_name
deployed_commit=$install_dir/DEPLOYED_COMMIT
previous_image=$install_dir/previous-image
rollback_tag=${image_name%:*}:rollback
promoted=0

restore_previous_image() {
  if [[ -f $previous_image ]]; then
    docker tag "$(<"$previous_image")" "$image_name"
    docker compose --env-file "$environment_file" -f "$compose_file" up --detach --force-recreate --no-build api
  fi
}

finish() {
  local exit_status=$?
  trap - EXIT
  if ((exit_status != 0 && promoted)); then
    echo 'Restoring the previous TeamRun API image' >&2
    restore_previous_image || true
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
archive_url=$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .url' "$release_json")
curl "${asset_curl_args[@]}" "$manifest_url" -o "$manifest_path"

jq -e \
  --arg asset "$asset_name" \
  --arg image "$image_name" \
  '.schemaVersion == 1 and .channel == "preview" and .image == $image and .artifact.name == $asset and (.commit | test("^[0-9a-f]{40}$")) and (.artifact.sha256 | test("^[0-9a-f]{64}$")) and (.artifact.size | type == "number" and . > 0)' \
  "$manifest_path" >/dev/null
next_commit=$(jq -er '.commit' "$manifest_path")
expected_sha256=$(jq -er '.artifact.sha256' "$manifest_path")
expected_size=$(jq -er '.artifact.size' "$manifest_path")

if [[ -f $deployed_commit && $(<"$deployed_commit") == "$next_commit" ]]; then
  echo "TeamRun API is already at $next_commit"
  exit 0
fi

curl "${asset_curl_args[@]}" "$archive_url" -o "$archive_path"
[[ $(stat -c '%s' "$archive_path") == "$expected_size" ]] || { echo 'API asset size mismatch' >&2; exit 1; }
printf '%s  %s\n' "$expected_sha256" "$archive_path" | sha256sum --check --status

current_image=$(docker inspect --format '{{.Image}}' teamrun-api-1)
docker tag "$current_image" "$rollback_tag"
printf '%s\n' "$rollback_tag" > "$previous_image.new"
mv "$previous_image.new" "$previous_image"
gzip --decompress --stdout "$archive_path" | docker load
promoted=1
docker compose --env-file "$environment_file" -f "$compose_file" up --detach --force-recreate --no-build api

for _ in $(seq 1 45); do
  if curl -fsS --connect-timeout 3 --max-time 5 "$health_url" >/dev/null; then
    printf '%s\n' "$next_commit" > "$deployed_commit.new"
    mv "$deployed_commit.new" "$deployed_commit"
    promoted=0
    echo "Deployed TeamRun API commit $next_commit"
    exit 0
  fi
  sleep 2
done

echo 'TeamRun API health check failed' >&2
exit 1
