# Security baseline

## Secrets

SESSION_SECRET protects control-plane sessions.

MASTER_KEY encrypts saved project environment values and deployment-agent tokens with AES-256-GCM.

INTERNAL_API_TOKEN authenticates backup-service callbacks.

LOCAL_AGENT_TOKEN authenticates the control plane/worker to the local deployment agent.

WEBHOOK_SECRET authenticates Forgejo push events.

Use independent random values for every secret. Do not reuse passwords as encryption keys.

## Owner login

The first owner is bootstrapped only when the users table is empty and supplied credentials exactly match protected server environment values.

Passwords are stored with bcrypt cost 12.

Login attempts are keyed by a hash of source IP plus email. Five failed attempts inside the window produce a temporary lockout.

Session cookies are HTTP-only, SameSite Strict and Secure in production.

Authenticator MFA is supported and its TOTP secret is encrypted at rest.

## Forgejo

Public registration is disabled.

Private repository view requires sign-in.

Do not expose the Forgejo administrator password in application repositories.

After first boot, prefer a scoped Forgejo API token for the control plane instead of Basic authentication.

## Deployment agent

The agent controls Docker and is therefore privileged infrastructure.

Do not put its listening port on the public internet.

Use a private network, strict firewall rules and a long random token.

The agent validates project slug, domain, image, port, health path and environment keys before invoking Docker.

Application environment values are written to a mode-0600 temporary env file and deleted immediately after container creation.

## Docker socket

The worker and agent mount the Docker socket. Compromise of either service can become host-level compromise.

Run builders on a separate host before accepting untrusted repositories or third-party contributors.

This initial platform assumes repositories are controlled by the owner. Do not market it as a hostile multi-tenant build service without replacing direct Docker-socket access with a hardened sandboxed builder.

## Network exposure

Do not publish PostgreSQL or Redis ports.

Do not expose Prometheus, Loki, cAdvisor or node-exporter directly.

Route administrative web interfaces through HTTPS and add an additional identity layer if they will be internet-accessible.

## Backups

Backup encryption is controlled by RESTIC_PASSWORD.

Store that password outside the machine being backed up as part of the recovery packet.

A local-only restic repository protects against accidental deletion but not machine loss, theft or fire.

## Updates

Do not blindly auto-update every production container.

Review Forgejo, Traefik, PostgreSQL, MinIO, Grafana, Loki, Prometheus and Docker release notes before major upgrades.

Take a verified backup before database or source-control upgrades.

## Audit

Repository creation/import, project creation, deployment requests, environment changes, server registration, authentication changes and backup requests are written to audit_logs.

Audit logs should eventually be shipped to an external append-only destination if this platform grows beyond a single owner.
