# My GitHub — Private Developer Cloud

My GitHub is a self-hosted source-control and application deployment platform. It is designed to replace the everyday GitHub + Railway/Vercel workflow with infrastructure you control.

## Included

- Forgejo for Git repositories, branches, commits, SSH/HTTPS cloning, packages and Actions.
- A custom Next.js control plane for projects, repositories, deployment history, servers, runtime logs, storage, backups, monitoring and audit history.
- PostgreSQL for platform metadata plus a separate managed application PostgreSQL service.
- Redis for the deployment queue.
- A build worker that turns an exact Git commit into an immutable Docker image.
- Forgejo's private OCI/container registry.
- Deployment agents for local or remote Docker hosts.
- Traefik for HTTPS, domains and atomic route changes.
- MinIO for S3-compatible project object storage.
- Restic for encrypted backups and retention.
- Prometheus, Grafana, cAdvisor and node-exporter for infrastructure metrics.
- Loki and Promtail for container logs.
- A built-in public status page with no separate setup.

## Deployment safety

A normal production deploy is:

1. Receive a manual request or signed Forgejo push event.
2. Queue one deployment record in Redis/PostgreSQL.
3. Clone the configured branch or exact webhook revision.
4. Build an immutable Docker image tagged by commit SHA.
5. Push the image to the private registry.
6. Start a new candidate container without touching the current production route.
7. Call the application's readiness endpoint over the private Docker network.
8. Atomically update Traefik only after the candidate becomes healthy.
9. Remove the previous production container.
10. Mark the deployment healthy and retain the prior image for rollback.

A failed candidate is removed while the current live route stays unchanged.

Queued releases can be canceled before a builder claims them.

Prior immutable images can be rolled back without rebuilding old source.

## Environments

Each project supports:

- Production domain + branch.
- Optional staging domain + branch.
- One-off branch previews under PREVIEW_BASE_DOMAIN.
- Automatic production/staging deploys from signed Forgejo push webhooks.
- Preview teardown, including preview-only containers, routes and volumes.

Project environment values are scoped to:

- production
- staging
- preview
- all

Production database/object-storage credentials are not automatically copied into staging or preview.

## Persistent data

Projects can provision:

### Managed PostgreSQL

The platform creates a separate database and login for a project, generates a strong password and stores DATABASE_URL encrypted in the production environment.

The password can be rotated without exposing the replacement credential in the UI.

### S3-compatible object storage

One click creates:

- a dedicated MinIO bucket
- a dedicated MinIO user
- a bucket-only access policy
- encrypted S3 environment credentials for the production app

### Persistent Docker volumes

Add named project volumes and mount paths such as:

    uploads -> /app/uploads

The volume remains attached across container replacements. Preview/staging runtimes receive runtime-specific Docker volume names, keeping them separate from production data.

## Monitoring

The worker checks:

- deployment-agent health every 30 seconds
- production and staging public HTTPS health endpoints every minute

Health history includes:

- status
- HTTP response code
- latency
- error
- timestamp

Set ALERT_WEBHOOK_URL to receive JSON notifications when a site or deployment server changes between healthy/offline states.

Grafana starts with a provisioned Platform Operations dashboard. Loki is already configured as its log source.

STATUS_DOMAIN routes to the built-in public status page. It exposes only aggregate service health, not repository names, secrets, customer information or private infrastructure addresses.

## Backups and recovery

The backup service captures:

- platform PostgreSQL
- Forgejo PostgreSQL
- all managed application PostgreSQL databases
- Forgejo repository/application data
- MinIO object data
- local persistent Docker volume data on the all-in-one host

Restic retention keeps:

- 7 daily snapshots
- 5 weekly snapshots
- 12 monthly snapshots

The Backups page can run a restore drill for the platform or Forgejo database.

Restore drills are deliberately non-destructive:

- the selected Restic snapshot is restored into a temporary workspace
- a new inspection database is created
- the live database is never overwritten
- the inspection database can be deleted separately after verification

The default local RESTIC_REPOSITORY is suitable only for initial testing. Production must use an off-site repository in a separate failure domain.

See docs/DISASTER_RECOVERY.md.

## Access control

The control plane supports four roles:

- Owner — full platform control plus user administration.
- Admin — infrastructure, projects, deployments, backups and settings; cannot manage Owner accounts.
- Developer — repositories, projects and deployments; no infrastructure/security administration.
- Viewer — read-only application/project surfaces.

Owner-managed users live under Settings -> Users. Accounts can be disabled without deletion and password rotation is audited. The platform prevents removal/disablement of the final enabled Owner.

These roles govern the My GitHub control plane. Forgejo's own repository collaborators, SSH keys and branch permissions remain managed in Forgejo.

## Background workers and cron

Projects may define:

- long-running worker commands
- five-field UTC cron commands

Workers use the same immutable production image, production/all-scoped environment values and production volumes. They are reconciled after every successful production deployment.

Cron runs use the latest healthy production image, are recorded in PostgreSQL, and keep recent output/error history in the project console. Commands run inside the application image through /bin/sh -lc, so the image must contain a POSIX shell for background-service features.

## Project lifecycle

Projects are archived rather than hard-deleted.

Archiving:

- disables auto-deploy
- hides the project from the active project list
- preserves repository references
- preserves databases
- preserves object storage
- preserves Docker volumes
- preserves deployment history
- can be reversed from Archived Projects

## First boot

Requirements:

- Linux
- Docker Engine
- Docker Compose v2
- public DNS pointing at the server
- ports 80/443 available
- port 2222 only if Forgejo SSH cloning should be public
- recommended starting point: 4+ CPU cores, 8+ GB RAM and SSD storage

Create the production environment file:

~~~sh
cp .env.example .env
nano .env
~~~

Generate independent random secrets. Examples:

~~~sh
openssl rand -base64 48
openssl rand -base64 32
~~~

MASTER_KEY must decode to exactly 32 bytes. Do not rotate it casually: it encrypts saved project environment values and server-agent credentials.

Configure DNS for:

- CONTROL_DOMAIN
- GIT_DOMAIN
- STORAGE_DOMAIN
- STORAGE_CONSOLE_DOMAIN
- GRAFANA_DOMAIN
- STATUS_DOMAIN
- *.PREVIEW_BASE_DOMAIN if previews are wanted

Then:

~~~sh
chmod +x scripts/bootstrap.sh ops/backup/*.sh ops/remote-node/install.sh
./scripts/bootstrap.sh
~~~

Bootstrap refuses to start while obvious placeholder values remain.

It:

- loads .env
- starts the databases, Redis, Forgejo, Traefik and MinIO
- creates the Forgejo administrator if needed
- builds and starts the custom control plane, worker, agent, backup and observability stack
- waits for the control plane to become healthy
- automatically registers the local deployment agent

The first control-panel login uses BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD. The password is stored as a bcrypt hash. Enable authenticator MFA immediately afterward.

## Repository setup

Repositories can be created directly in the Repositories page or imported from an allowlisted public HTTPS Git host. GIT_IMPORT_HOSTS defaults to GitHub, GitLab, Bitbucket and Codeberg. Project deployment URLs themselves must point to the configured Forgejo host.

When a project is created, My GitHub automatically creates or updates its signed Forgejo push webhook. The webhook listens for pushes but the receiver only queues branches configured as production/staging targets.

Forgejo remains available directly at GIT_DOMAIN for deeper Git features such as pull requests, branch protection, SSH keys, tags, packages and Actions.

## Application contract

The simplest application contains a Dockerfile and a real readiness endpoint, for example:

    GET /api/health -> 200

The app must listen on the configured container port.

The health endpoint should prove the app can actually serve traffic. Database-backed apps should include a lightweight database connectivity check.

Do not commit production secrets. Store them in the project's Environment panel.

## Self-hosted Forgejo CI

GitHub Actions is used only while this bootstrap repository is still hosted on GitHub. The repository also contains its native Forgejo workflow at `.forgejo/workflows/verify.yml`.

After importing this repository into your Forgejo instance, install Forgejo Runner on a **separate CI machine**. Do not place a workflow runner on the production/control host.

Generate the tightest possible registration token from the Forgejo server. For this repository:

~~~sh
sh scripts/forgejo-runner-token.sh YOUR_FORGEJO_OWNER/my-github
~~~

On the dedicated CI server:

~~~sh
FORGEJO_URL='https://git.example.com' \\
FORGEJO_RUNNER_TOKEN='token-from-the-command-above' \\
RUNNER_NAME='ci-01' \\
bash ops/forgejo-runner/install.sh
~~~

The installer verifies the Forgejo release signature, registers the repository-scoped runner, uses a Docker-backed `docker` label with Node 22, and runs the daemon as a non-login `runner` user under systemd.

Treat anyone who can modify a workflow in a repository assigned to a runner as capable of executing code on that runner.

## Remote deployment nodes

Run the installer from a checked-out copy of this repository on the remote Docker server:

~~~sh
AGENT_TOKEN='a-long-random-token' \
ACME_EMAIL='admin@example.com' \
AGENT_BIND_ADDRESS='PRIVATE_OR_VPN_IP' \
sh ops/remote-node/install.sh
~~~

The installer copies and builds Dockerfile.agent/services/agent.mjs locally. It does not depend on a placeholder public container image.

Register the private agent URL in Servers. Do not expose port 7001 to the public internet.

## Validation

GitHub Actions currently validates each commit while this bootstrap repository still lives on GitHub. CI performs:

- npm install
- TypeScript typecheck
- Node tests
- worker/agent syntax validation
- shell syntax validation
- every numbered SQL migration against a real PostgreSQL 18 service
- Next.js production build
- control/worker/agent/backup Docker image builds
- Docker Compose configuration validation

The platform itself does not require GitHub after installation.

## Security boundary

The worker and deployment agent mount the Docker socket and therefore have host-level power. This first release is for owner-controlled/private repositories.

Do not expose it as an untrusted public multi-tenant build service without replacing the Docker-socket builder with a hardened sandbox.

See docs/SECURITY.md.

## Documentation

- docs/ARCHITECTURE.md
- docs/SECURITY.md
- docs/DISASTER_RECOVERY.md
- docs/MIGRATION.md
- docs/LAUNCH_CHECKLIST.md
