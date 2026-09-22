# Migration from GitHub and Railway

Migrate incrementally. Do not shut down the current production service first.

## Git repositories

For public GitHub repositories, use Repositories -> Import GitHub/Git and supply the clone URL.

For private repositories, either mirror using authenticated Git outside the web form or configure Forgejo's migration credentials temporarily. Remove migration credentials after use.

Confirm branches, tags and commit history in Forgejo before treating it as authoritative.

During the transition you can keep GitHub as a secondary mirror, but production deploys should eventually use the Forgejo URL.

## Railway/Vercel applications

Inventory each project:

- repository and production branch
- build Dockerfile/start behavior
- all environment variables
- public domains
- container/listening port
- health endpoint
- PostgreSQL/Redis dependencies
- persistent volumes
- cron jobs/workers
- DNS records

Create the replacement project in My GitHub using a staging hostname first.

Migrate application data separately from application code.

Run the new application and exercise the real customer workflow.

Compare database writes if both systems can temporarily run against isolated test data.

Lower DNS TTL before cutover when practical.

Point the production hostname at the new server only after health, TLS, logs and backups are verified.

Keep the previous provider available during a defined rollback window.

## Suggested migration order

Start with a non-critical internal site.

Next migrate static/marketing sites.

Then migrate applications with simple databases.

Move revenue- or operations-critical applications last after several successful deployments and a completed restore drill.

## No-surprise cutover checklist

Repository cloned from Forgejo.

Current commit SHA matches intended production revision.

Environment variables entered through the encrypted Environment panel.

Database backup taken immediately before migration.

Persistent uploads copied and verified.

New health endpoint returns success.

HTTPS certificate issued.

Automated backup completed off-site.

Monitoring/uptime check configured.

Rollback path written down.

Only then change DNS.
