#!/usr/bin/env sh
set -eu

scope="${1:-}"

if [ ! -f docker-compose.yml ]; then
  echo "Run this script from the My GitHub repository root on the Forgejo control server." >&2
  exit 1
fi

if [ -n "${scope}" ]; then
  docker compose exec -T -u git forgejo forgejo forgejo-cli actions generate-runner-token --scope "${scope}"
else
  docker compose exec -T -u git forgejo forgejo forgejo-cli actions generate-runner-token
fi
