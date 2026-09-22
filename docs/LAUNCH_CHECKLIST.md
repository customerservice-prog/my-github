# Production launch checklist

Use this after the code is deployed to the server and before moving any important application onto the platform.

## Infrastructure

- Docker Engine and Docker Compose v2 installed.
- Host has adequate CPU, RAM and SSD space.
- Automatic OS security updates or a documented patching routine exists.
- SSH password login disabled where practical.
- Root SSH login disabled where practical.
- Host firewall allows only the ports that are intentionally public.
- Deployment-agent port 7001 is private/VPN-only.
- PostgreSQL and Redis are not published to the internet.

## DNS

Create records for:

- CONTROL_DOMAIN
- GIT_DOMAIN
- STORAGE_DOMAIN
- STORAGE_CONSOLE_DOMAIN
- GRAFANA_DOMAIN
- STATUS_DOMAIN

If branch previews are enabled:

- *.PREVIEW_BASE_DOMAIN points to the relevant deployment server.

Run:

    npm run preflight

or run scripts/bootstrap.sh, which executes preflight automatically.

## Secrets

- Every replace-* value removed from .env.
- SESSION_SECRET is unique.
- INTERNAL_API_TOKEN is unique.
- WEBHOOK_SECRET is unique.
- LOCAL_AGENT_TOKEN is unique.
- RESTIC_PASSWORD is unique.
- MASTER_KEY is a 32-byte random value encoded as base64.
- A protected copy of MASTER_KEY and RESTIC_PASSWORD is stored outside the server.
- Forgejo control-plane access uses a scoped token after initial setup where practical.

## First login

- Owner login succeeds.
- Authenticator MFA enabled.
- Local Production server shows ONLINE.
- Forgejo login succeeds.
- Grafana login succeeds.
- MinIO console login succeeds.
- Public status hostname opens the built-in status page.

## Source control

- Create a disposable repository in My GitHub.
- Clone it over HTTPS.
- Push a commit.
- Clone it over SSH if SSH access will be used.
- Confirm registration is closed to the public.
- Confirm repositories default to private.
- Confirm the project creation flow installs a signed push webhook.

## Deployment smoke test

Use a disposable application with:

- Dockerfile
- /api/health endpoint
- one environment variable

Then verify:

- manual production deploy
- automatic deploy after push
- failed candidate does not replace healthy production
- application logs load from the project page
- runtime restart works
- maintenance mode works and can be reversed
- rollback starts a prior immutable image without rebuilding
- queued deployment cancellation works

## Staging and preview

- Configure a staging branch/domain.
- Push staging branch and verify only staging changes.
- Add a Preview-scoped environment value.
- Deploy a feature branch preview.
- Confirm the preview hostname receives HTTPS.
- Tear the preview down.
- Confirm the route and preview container disappear.

## Persistent data

### Managed PostgreSQL

- Provision a project database.
- Deploy an app that uses DATABASE_URL.
- Write test data.
- Redeploy the app.
- Confirm the data remains.
- Rotate the database password.
- Restart/redeploy the app.
- Confirm connectivity uses the new secret.

### Persistent volume

- Create a project volume.
- Write a test file through the app/container.
- Redeploy.
- Confirm the file remains.

### Object storage

- Provision a project bucket.
- Confirm S3 environment values are added to Production.
- Upload/read/delete a test object using the project credentials.
- Confirm those credentials cannot access another project's bucket.

## Monitoring

- Production external health check appears.
- Staging external health check appears if configured.
- Latency and HTTP status are visible.
- Stop a disposable app and confirm an UNHEALTHY transition.
- If ALERT_WEBHOOK_URL is configured, confirm the alert is received.
- Stop/restart a disposable deployment agent and confirm server transition reporting.
- Grafana Platform Operations dashboard displays host/container metrics and Loki logs.

## Backups

Before trusting the platform:

- RESTIC_REPOSITORY points off the production host.
- Successful snapshot appears in Backups.
- Platform restore drill reaches READY.
- Inspect temporary platform database.
- Delete the test restore.
- Forgejo restore drill reaches READY.
- Inspect temporary Forgejo database.
- Delete the test restore.
- Run restic check against the backup repository.
- Document where recovery credentials are stored.

## Disaster recovery drill

On a different clean server:

- obtain this repository
- restore protected .env/recovery secrets
- restore a Restic snapshot
- bring up Forgejo
- clone a restored repository
- restore platform metadata
- deploy one non-critical application
- verify its HTTPS health check

Record the result and recovery time.

## Migration order

Do not start with the most important production application.

Recommended order:

1. disposable test app
2. internal/static site
3. non-critical marketing site
4. simple database-backed app
5. larger SaaS/application
6. revenue/operations-critical production system

Keep the previous host/provider available during a rollback window until the new platform has proven deployment, backup and restore behavior.

## Native Forgejo CI

Before retiring GitHub as the bootstrap source:

- Import this repository into Forgejo.
- Confirm Actions is enabled on the repository.
- Generate a repository-scoped runner token.
- Provision a separate CI machine.
- Run `ops/forgejo-runner/install.sh` on that CI machine.
- Confirm the runner appears under repository Settings -> Actions -> Runners.
- Push a harmless commit.
- Confirm `.forgejo/workflows/verify.yml` runs and passes.
- Confirm the CI host is not the same machine as production databases/control services.
- Restrict who can modify workflow files and who has direct push access to repositories assigned to the runner.
