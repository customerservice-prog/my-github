# Disaster recovery

A backup is not considered valid until a restore has been tested.

## Recovery material to keep off the production server

- this repository
- the production .env or a secure record of every required secret
- RESTIC_PASSWORD
- credentials for the off-site restic repository
- DNS/registrar access
- SSH/private-network access for replacement servers
- Forgejo repository and database snapshots
- platform database snapshot
- MinIO/application object snapshot

## Quarterly restore drill

Provision a clean Linux host with Docker and Compose.

Clone or otherwise restore this repository.

Restore the protected environment file.

Start only PostgreSQL, Forgejo PostgreSQL and the backup tooling.

Use restic snapshots to select a known backup.

Restore the platform and Forgejo SQL dumps into fresh databases.

Restore Forgejo and object-storage files.

Start Forgejo and verify repository history can be cloned.

Start the control plane and verify projects, encrypted environment metadata and audit records appear.

Start the deployment worker and agent on an isolated test domain.

Redeploy one non-critical project from a restored repository.

Verify its health check, HTTPS route and persistent data.

Record the recovery time and any manual step not already documented.

## Total server loss

If the primary server disappears, do not point production DNS at a half-restored replacement.

Bring up the replacement privately first.

Restore data.

Deploy applications.

Test using temporary hostnames or local DNS overrides.

Only then change public DNS.

## Database restore safety

Prefer restoring into a new database rather than overwriting the damaged database in place.

Validate row counts and application login before switching connection strings.

## Restic commands

List snapshots:

    restic snapshots

Restore one snapshot into a temporary directory:

    restic restore SNAPSHOT_ID --target /restore-test

Check repository integrity periodically:

    restic check

A successful scheduled backup event is not a substitute for these restore tests.
