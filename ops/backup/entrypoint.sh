#!/usr/bin/env bash
set -u

interval="${BACKUP_INTERVAL_SECONDS:-21600}"
mkdir -p /control

while true; do
  if [ -f /control/trigger ] || [ ! -f /control/last-run ]; then
    rm -f /control/trigger
    /backup/backup.sh || true
    date -u +%FT%TZ > /control/last-run
  fi
  sleep "${interval}"
done
