#!/usr/bin/env bash
set -Eeuo pipefail

mkdir -p /tmp/dumps
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
platform_dump="/tmp/dumps/platform-${timestamp}.sql.gz"
forgejo_dump="/tmp/dumps/forgejo-${timestamp}.sql.gz"
app_dump="/tmp/dumps/app-databases-${timestamp}.sql.gz"

report() {
  local status="$1"
  local snapshot="${2:-}"
  local error="${3:-}"
  curl -fsS -X POST "${CONTROL_INTERNAL_URL}/api/internal/backup-events"     -H "authorization: Bearer ${INTERNAL_API_TOKEN}"     -H "content-type: application/json"     --data "$(jq -nc --arg status "$status" --arg snapshot "$snapshot" --arg error "$error"       '{kind:"PLATFORM",target:"all",status:$status,snapshotId:$snapshot,error:($error|select(length>0))}')" >/dev/null || true
}

fail() {
  report "FAILED" "" "backup process failed"
}
trap fail ERR

pg_dump "${PLATFORM_DATABASE_URL}" | gzip -9 > "${platform_dump}"
pg_dump "${FORGEJO_DATABASE_URL}" | gzip -9 > "${forgejo_dump}"
pg_dumpall --dbname="${APP_DATABASE_ADMIN_URL}" | gzip -9 > "${app_dump}"

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

restic backup /sources/forgejo /sources/minio /sources/docker-volumes /tmp/dumps
snapshot="$(restic snapshots --json --latest 1 | jq -r '.[0].short_id // ""')"
restic forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --prune
report "SUCCESS" "${snapshot}" ""
rm -f /tmp/dumps/*.sql.gz
trap - ERR
