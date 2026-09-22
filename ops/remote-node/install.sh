#!/usr/bin/env sh
set -eu

: "${AGENT_TOKEN:?Set AGENT_TOKEN}"
: "${ACME_EMAIL:?Set ACME_EMAIL}"

AGENT_BIND_ADDRESS="${AGENT_BIND_ADDRESS:-127.0.0.1}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"

mkdir -p /opt/my-github-agent/dynamic /opt/my-github-agent/services
cp "${ROOT_DIR}/Dockerfile.agent" /opt/my-github-agent/Dockerfile.agent
cp "${ROOT_DIR}/services/agent.mjs" /opt/my-github-agent/services/agent.mjs
cd /opt/my-github-agent

cat > compose.yml <<EOF
services:
  traefik:
    image: traefik:v3.7
    restart: unless-stopped
    command:
      - --providers.file.directory=/dynamic
      - --providers.file.watch=true
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./dynamic:/dynamic
      - acme:/letsencrypt
    networks: [proxy]

  agent:
    build:
      context: .
      dockerfile: Dockerfile.agent
    restart: unless-stopped
    environment:
      AGENT_TOKEN: ${AGENT_TOKEN}
      TRAEFIK_DYNAMIC_DIR: /dynamic
      PROXY_NETWORK: platform-proxy
      CERT_RESOLVER: letsencrypt
      AGENT_PORT: "7001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./dynamic:/dynamic
    networks: [proxy]
    ports:
      - "${AGENT_BIND_ADDRESS}:7001:7001"

networks:
  proxy:
    name: platform-proxy

volumes:
  acme:
EOF

docker compose build --pull agent
docker compose up -d

echo "Remote deployment node is running."
echo "Agent bind: ${AGENT_BIND_ADDRESS}:7001"
echo "For remote control-plane access, set AGENT_BIND_ADDRESS to the server's VPN/private IP before running this installer."
