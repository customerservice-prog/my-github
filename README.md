# My GitHub — Private Developer Cloud

This repository is a self-hosted source-control and deployment platform designed to replace the day-to-day workflow of GitHub + Railway/Vercel with infrastructure you control.

It combines:

- Forgejo for Git repositories, branches, commits, SSH/HTTPS cloning, packages and Actions support.
- A custom Next.js control plane for projects, repository imports, servers, encrypted environment variables, deployments, backups, audit history and owner security.
- A dedicated build worker that turns a Git commit into an immutable Docker image and pushes it to your private OCI registry.
- A lightweight deployment agent that starts a candidate container, health-checks it, atomically changes Traefik routing, then retires the previous container.
- PostgreSQL for platform metadata.
- Redis for durable deployment queueing.
- MinIO for S3-compatible object storage.
- Traefik for domains, HTTPS and automatic certificate renewal.
- Restic for encrypted snapshot backups and retention.
- Prometheus + Grafana + cAdvisor + node-exporter for metrics.
- Loki + Promtail for centralized container logs.
- Uptime Kuma for outside-in service checks and notifications.

## What works

The launch path is intentionally simple:

1. Create or import a repository.
2. Register a local or remote deployment server.
3. Create a project and attach its repository, branch, domain, Dockerfile, port and health endpoint.
4. Add encrypted environment variables.
5. Click Deploy or push to the configured branch through the signed Forgejo webhook.
6. The worker clones the exact revision, builds and pushes an immutable image.
7. The agent launches a candidate and waits for its health URL.
8. Only after a successful health check does Traefik switch traffic.
9. Failed candidates are removed while the current production route stays untouched.

## Requirements

- Linux server with Docker Engine and Docker Compose v2.
- At least 4 CPU cores, 8 GB RAM and SSD storage for a comfortable all-in-one install. More is recommended if you build large applications on the same host.
- Public DNS records for the control, Git, storage, Grafana and status domains.
- Ports 80 and 443 reachable for HTTPS issuance.
- Port 2222 reachable only if you want Forgejo SSH Git access from outside.
- A separate off-site backup target for real disaster recovery.

## First boot

~~~sh
cp .env.example .env
nano .env
~~~

Replace every placeholder. Generate strong values, for example:

~~~sh
openssl rand -base64 48
openssl rand -base64 32
~~~

MASTER_KEY must decode to exactly 32 bytes. Never rotate MASTER_KEY without first decrypting/re-encrypting stored secrets.

Point DNS records at the server, then:

~~~sh
chmod +x scripts/bootstrap.sh ops/backup/*.sh
./scripts/bootstrap.sh
~~~

The bootstrap script refuses to launch while obvious placeholder values remain.

The first control-plane login uses BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD and writes a bcrypt password hash to PostgreSQL. Enable authenticator MFA from Settings immediately after login.

## Required first server

For an all-in-one install, register:

- Name: Local Production
- Agent URL: http://agent:7001
- Token: the LOCAL_AGENT_TOKEN value from the server environment

The control plane and agent share the private Docker control network, so that URL is intentionally not public.

## Auto deploy webhook

Configure the Forgejo repository push webhook to:

    https://YOUR_CONTROL_DOMAIN/api/webhooks/forgejo

Use WEBHOOK_SECRET as the webhook secret. The receiver accepts Forgejo/Gitea HMAC SHA-256 signatures and ignores branches that are not the project's configured production branch.

## Application contract

A deployable application should contain a Dockerfile and expose a real readiness endpoint such as:

    GET /api/health -> 200

The endpoint should verify enough of the application to prove it can serve traffic. For database-backed applications, include a lightweight database connectivity check.

Do not store application secrets in Git. Add them through the project's Environment panel.

## Backups

The bundled backup service captures:

- platform PostgreSQL
- Forgejo PostgreSQL
- Forgejo repository/application data
- MinIO object data

Restic retention keeps 7 daily, 5 weekly and 12 monthly snapshots.

The default RESTIC_REPOSITORY is a local Docker volume only for initial testing. Before production, use off-site S3-compatible storage. See docs/DISASTER_RECOVERY.md.

## Remote deployment nodes

The all-in-one node is not the only topology. services/agent.mjs is designed to run beside Docker on separate production servers.

Never expose the agent directly to the public internet. Put it behind WireGuard/Tailscale/private networking or another authenticated private network.

The remote-node installer in ops/remote-node is a reference bootstrap. Build and publish the agent image from this repository before using that script.

## Validation

~~~sh
npm install
npm run typecheck
npm test
npm run build
cp .env.example .env
docker compose config --quiet
~~~

GitHub Actions runs these checks on pushes while this project is still being developed on GitHub.

## Important boundaries

This platform deliberately uses proven Git and container primitives instead of reimplementing Git object storage. Forgejo is the Git engine. The custom control plane is the private developer-cloud experience and deployment orchestration layer.

The platform can be used without GitHub once it is installed. GitHub is only the current bootstrap location for this repository.

## Documentation

- docs/ARCHITECTURE.md
- docs/SECURITY.md
- docs/DISASTER_RECOVERY.md
- docs/MIGRATION.md
