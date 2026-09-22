# Architecture

## Control plane

The Next.js application owns platform metadata and operator workflows. PostgreSQL stores users, projects, deployment history, encrypted environment variables, servers, backups and audit events. Redis carries deployment job IDs.

The control plane never stores plaintext project secrets. Values are encrypted with AES-256-GCM before they enter PostgreSQL.

## Source control

Forgejo owns Git repository data and Git-facing protocols. The custom UI calls Forgejo's API to create repositories, import external Git repositories and list repository metadata.

Forgejo also provides the private OCI package/registry endpoint used by the build worker.

## Build path

A deployment row begins in QUEUED.

The worker:

1. Claims the job from Redis.
2. Clones the project's configured branch.
3. Checks out the requested webhook commit when applicable.
4. Reads the resulting Git SHA.
5. Builds the project's Dockerfile.
6. Tags the image with that SHA.
7. Pushes the image to the private registry.
8. Decrypts the project's runtime environment in memory.
9. Sends the immutable image reference and runtime config to the assigned agent.

Deployment states are QUEUED, BUILDING, PUSHING, DEPLOYING, HEALTHY or FAILED.

## Traffic switching

Application containers are attached to the platform-proxy Docker network.

The agent never immediately replaces the production route. It starts a uniquely named candidate container and calls its health endpoint over the private Docker network.

On success the agent writes a new Traefik dynamic configuration file to a temporary path and atomically renames it. Traefik watches that directory and reloads the route. The previous container is removed only after the route change.

On candidate failure the candidate is removed and the existing Traefik file is left untouched.

## Data separation

Source code: Forgejo volumes.

Platform metadata: platform PostgreSQL.

Forgejo metadata: dedicated Forgejo PostgreSQL.

Large application objects: MinIO or an external S3 provider.

Build artifacts: private OCI registry.

Backups: restic repository, preferably off-site.

These layers are intentionally separate so redeploying an application does not destroy persistent data.

## Networking

Only Traefik should normally publish HTTP/HTTPS ports.

PostgreSQL, Redis, MinIO internals and the deployment worker live on private Docker networks.

Forgejo SSH publishes port 2222 if remote SSH cloning is required.

The local agent has no host port mapping. Remote agents should be reachable only over protected private networking.

## Scaling path

For initial use, every service can live on one server.

The next safe split is:

- control node: control plane, Forgejo, Redis
- builder node: build worker and Docker build cache
- production node(s): Traefik + deployment agent + application containers
- data node: managed or dedicated PostgreSQL/object storage
- backup target: separate physical/provider failure domain

The database schema already models multiple deployment servers.

## Observability

Prometheus scrapes node-exporter, cAdvisor and itself on the private control network.

Grafana is provisioned with Prometheus and Loki data sources plus the Platform Operations dashboard.

Grafana Alloy discovers Docker containers from the read-only Docker socket and forwards container logs to Loki. Promtail is not used.

The control worker separately performs external HTTPS health checks for production/staging applications and private deployment-agent health/resource checks. Those checks drive the dashboard/status page and optional ALERT_WEBHOOK_URL transition notifications.

## Source-built object storage

The bundled S3 layer is built from the pinned upstream MinIO Community source release rather than depending on a community image tag. The deployment agent embeds a separately pinned upstream `mc` client binary built from source. This keeps project-bucket provisioning self-contained even after MinIO Community moved away from maintained binary/container distribution.

## Self-hosted CI

Forgejo Actions is supported through a dedicated Forgejo Runner host. The runner is intentionally installed on a separate CI machine so workflow execution does not share a trust boundary with production databases, source-control storage or deployment agents. The repository includes a non-privileged Forgejo workflow for dependency installation, TypeScript, tests, syntax checks, migrations and the Next.js production build.
