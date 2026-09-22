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

set -a
. ./.env
set +a

echo "Running production preflight..."
docker run --rm --env-file .env -v "$PWD/scripts:/app/scripts:ro" node:22-alpine node /app/scripts/preflight.mjs

docker compose up -d postgres app-postgres redis forgejo-db forgejo traefik minio
echo "Waiting for Forgejo..."
sleep 12

docker compose exec -T -u git forgejo forgejo admin user create \
  --username "${FORGEJO_ADMIN_USER:-admin}" \
  --password "${FORGEJO_ADMIN_PASSWORD}" \
  --email "${FORGEJO_ADMIN_EMAIL}" \
  --admin \
  --must-change-password=false 2>/dev/null || true

docker compose up -d --build

echo "Waiting for control plane..."
attempt=0
until docker compose exec -T control node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  attempt=$((attempt+1))
  if [ "${attempt}" -ge 40 ]; then
    echo "Control plane did not become healthy. Run: docker compose logs control postgres redis"
    exit 1
  fi
  sleep 3
done

docker compose exec -T control node -e "
fetch('http://127.0.0.1:3000/api/internal/bootstrap',{
  method:'POST',
  headers:{authorization:'Bearer '+process.env.INTERNAL_API_TOKEN}
}).then(async r=>{
  const body=await r.text();
  if(!r.ok){console.error(body);process.exit(1)}
  console.log(body)
}).catch(e=>{console.error(e);process.exit(1)})
"

echo "Platform started."
echo "Control plane: https://${CONTROL_DOMAIN}"
echo "Git:           https://${GIT_DOMAIN}"
echo "Status:        https://${STATUS_DOMAIN}"
