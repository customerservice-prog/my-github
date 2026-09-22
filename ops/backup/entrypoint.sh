#!/usr/bin/env bash
set -u

interval="${BACKUP_INTERVAL_SECONDS:-21600}"
mkdir -p /control /control/restore-requests

while true; do
  if [ -f /control/trigger ] || [ ! -f /control/last-run ]; then
    rm -f /control/trigger
    /backup/backup.sh || true
    date -u +%FT%TZ > /control/last-run
  fi

  shopt -s nullglob
  for request in /control/restore-requests/*.json; do
    processing="${request%.json}.processing"
    if mv "${request}" "${processing}" 2>/dev/null; then
      /backup/restore.sh "${processing}" || true
      rm -f "${processing}"
    fi
  done
  shopt -u nullglob

  sleep 5
done
