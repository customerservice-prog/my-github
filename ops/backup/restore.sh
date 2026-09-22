#!/usr/bin/env bash
set -Eeuo pipefail

request="${1:?restore request path required}"
job_id="$(jq -r '.jobId' "${request}")"
snapshot="$(jq -r '.snapshotId' "${request}")"
kind="$(jq -r '.kind' "${request}")"
action="$(jq -r '.action // "restore"' "${request}")"

if ! [[ "${job_id}" =~ ^[0-9]+$ ]]; then
  exit 1
fi
if ! [[ "${snapshot}" =~ ^[A-Za-z0-9_-]{4,128}$ ]]; then
  exit 1
fi
if [[ "${kind}" != "platform" && "${kind}" != "forgejo" ]]; then
  exit 1
fi
if [[ "${action}" != "restore" && "${action}" != "cleanup" ]]; then
  exit 1
fi

callback() {
  local status="$1"
  local database_name="${2:-}"
  local error="${3:-}"
  curl -fsS -X POST "${CONTROL_INTERNAL_URL}/api/internal/restore-events"     -H "authorization: Bearer ${INTERNAL_API_TOKEN}"     -H "content-type: application/json"     --data "$(jq -nc       --argjson jobId "${job_id}"       --arg status "${status}"       --arg databaseName "${database_name}"       --arg error "${error}"       '{jobId:$jobId,status:$status,databaseName:($databaseName|select(length>0)),error:($error|select(length>0))}')" >/dev/null || true
}

if [[ "${kind}" == "platform" ]]; then
  base_url="${PLATFORM_DATABASE_URL}"
  prefix="restore_platform_"
  pattern="platform-*.sql.gz"
else
  base_url="${FORGEJO_DATABASE_URL}"
  prefix="restore_forgejo_"
  pattern="forgejo-*.sql.gz"
fi

database_name="${prefix}${job_id}"
admin_url="$(printf '%s' "${base_url}" | sed -E 's#/[^/?]+(\?.*)?$#/postgres\1#')"
target_url="$(printf '%s' "${base_url}" | sed -E "s#/[^/?]+(\?.*)?$#/${database_name}\1#")"

if [[ "${action}" == "cleanup" ]]; then
  psql "${admin_url}" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database_name}' AND pid <> pg_backend_pid();" >/dev/null
  psql "${admin_url}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${database_name}\";" >/dev/null
  callback "CLEANED" "${database_name}" ""
  exit 0
fi

callback "RESTORING" "" ""
workspace="/tmp/restore-${job_id}"
rm -rf "${workspace}"
mkdir -p "${workspace}"

fail() {
  callback "FAILED" "" "restore drill failed"
  rm -rf "${workspace}"
}
trap fail ERR

restic restore "${snapshot}" --include "/tmp/dumps/${pattern}" --target "${workspace}" >/dev/null

dump="$(find "${workspace}" -type f -name "${pattern}" -print | sort | tail -n 1)"
if [[ -z "${dump}" || ! -f "${dump}" ]]; then
  echo "Database dump not found in snapshot" >&2
  exit 1
fi

psql "${admin_url}" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database_name}' AND pid <> pg_backend_pid();" >/dev/null
psql "${admin_url}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${database_name}\";" >/dev/null
psql "${admin_url}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${database_name}\";" >/dev/null
gunzip -c "${dump}" | psql "${target_url}" -v ON_ERROR_STOP=1 >/dev/null

callback "READY" "${database_name}" ""
rm -rf "${workspace}"
trap - ERR
