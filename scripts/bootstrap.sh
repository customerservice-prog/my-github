#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Edit every replace-* value and set your real domains, then run this script again."
  exit 1
fi

if grep -Eq 'replace-|example\.com|change-this' .env; then
  echo ".env still contains placeholder values. Refusing to launch production infrastructure."
  exit 1
fi

docker compose up -d postgres redis forgejo-db forgejo traefik minio
echo "Waiting for Forgejo..."
sleep 12

docker compose exec -T -u git forgejo forgejo admin user create   --username "${FORGEJO_ADMIN_USER:-admin}"   --password "${FORGEJO_ADMIN_PASSWORD}"   --email "${FORGEJO_ADMIN_EMAIL}"   --admin   --must-change-password=false 2>/dev/null || true

docker compose up -d --build
echo "Platform started."
echo "Control plane: https://${CONTROL_DOMAIN}"
echo "Git:           https://${GIT_DOMAIN}"
echo "Status:        https://${STATUS_DOMAIN}"
