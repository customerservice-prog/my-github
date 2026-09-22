#!/usr/bin/env sh
set -eu

: "${AGENT_TOKEN:?Set AGENT_TOKEN}"
: "${ACME_EMAIL:?Set ACME_EMAIL}"

mkdir -p /opt/my-github-agent/dynamic
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
    ports: ["80:80","443:443"]
    volumes:
      - ./dynamic:/dynamic
      - acme:/letsencrypt
    networks: [proxy]
  agent:
    image: ghcr.io/replace/me/my-github-agent:latest
    restart: unless-stopped
    environment:
      AGENT_TOKEN: ${AGENT_TOKEN}
      TRAEFIK_DYNAMIC_DIR: /dynamic
      PROXY_NETWORK: platform-proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./dynamic:/dynamic
    networks: [proxy]
    ports:
      - "127.0.0.1:7001:7001"
networks:
  proxy:
    name: platform-proxy
volumes:
  acme:
EOF

docker compose up -d
echo "Remote deployment node is running. Keep port 7001 private; expose it only through VPN/private networking."
