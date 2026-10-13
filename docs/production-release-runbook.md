# Production release and rollback runbook

This is a release procedure, not authorization to deploy. Replace bracketed values only after the
business owner and hosting administrator have approved them. Do not place secrets in this document,
source control, shell history, or ticket comments.

## Current verification status

- **Production database migration status: UNVERIFIED.** No operational database has been queried
  during this rehearsal.
- **Backup and restore rehearsal: BLOCKED.** The guarded test runtime permits only `bakanel_test`;
  it cannot restore safely into a second disposable target. This is not a passed restore test.
- **Production hostname, hosting provider, and administrator: UNCONFIGURED/UNVERIFIED.** None is
  declared by this repository or configured by this runbook.
- **Node runtime: reconcile before release.** The inspection shell used Node `v22.23.2`; release
  verification commands used Node `v20.20.0`; the repository pins pnpm but has no `engines.node`
  declaration. The hosting owner must select and pin one tested Node runtime before deployment.
- Every operational database read, migration, production write, push, and deployment requires
  separate explicit approval. This runbook authorizes none of those actions by itself.

## Preconditions

- The release commit is approved and the working tree is clean.
- The hosting owner has supplied the verified public HTTPS origin as `SITE_URL`, in origin-only
  form (for example, `https://www.example.org`). It must not include credentials, a path, query,
  fragment, IP address, loopback host, or port.
- The application runtime has its production `DATABASE_URL`; it must not be the test database.
- A migration operator has a migration-capable, direct PostgreSQL connection available as
  `DATABASE_URL`. The repository's Prisma configuration reads this variable for migration
  commands. Do not use a disposable URL or an HTTP/WebSocket application adapter URL for this
  operation.
- The database owner has confirmed a current backup and the point-in-time recovery procedure.
- The admin owner has selected the first administrator's email and name, and has a secure
  interactive terminal for password entry.

## Deployment

1. Record the release SHA, current production revision, deployment time, operator, and database
   backup/restore reference.
2. In a restricted migration environment, set the direct production `DATABASE_URL` and check only:

   ```sh
   pnpm exec prisma migrate status --config prisma7.config.ts
   ```

   Stop if the target hostname, database name, or migration status is unexpected. This command is
   read-only, but it is still production database access and requires separate authorization.

3. Only after explicit approval for an operational migration and backup confirmation, apply committed
   migrations:

   ```sh
   pnpm exec prisma migrate deploy --config prisma7.config.ts
   ```

   Never substitute `prisma db push`, `migrate dev`, or `migrate reset` in production.

4. Only after explicit approval to deploy, configure the application with the same verified `SITE_URL` at **build time and
   runtime**, the runtime `DATABASE_URL`, and (only when a trusted proxy overwrites it)
   `ADMIN_CLIENT_IP_HEADER`.
5. Build and launch:

   ```sh
   pnpm build
   pnpm start
   ```

   The process is a persistent Node.js Next.js server. Confirm the selected host supports that
   runtime and permits outbound PostgreSQL/Neon connectivity before release.

6. Create the first administrator only when one does not already exist:

   ```sh
   pnpm admin:create --email <admin-email> --name "<full name>"
   ```

   Enter the password in the TTY prompt. Never pass it as an argument. A duplicate email fails
   safely; the command is not an idempotent credential-reset mechanism.

## Post-deployment smoke checks

Read-only checks:

- Confirm `/fr`, `/en`, and `/pt` load.
- Confirm `/fr/formations`, `/en/formations`, and `/pt/formations` load.
- Open a known published programme in every locale in which it is published; confirm a
  draft/unpublished programme returns 404.
- Inspect page source/headers: canonical and `hreflang` links use the verified origin, `/robots.txt`
  allows public paths but disallows `/admin`, and `/sitemap-index.xml` plus its shards use that
  origin.
- Confirm `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and production HSTS headers are present.
- Confirm `/admin` requires login, then test login and logout with the designated administrator.
- Check application logs for connection, authentication, or route errors without recording
  credentials or session tokens.

Write-based checks require separate business authorization and cleanup ownership:

- Create and publish a synthetic programme, verify the homepage changes, then archive it.
- Create a test session and verify its enquiry destination and archive/lifecycle behavior.

Do not use historical or real records as smoke-test fixtures.

## Rollback and incidents

| Incident                                         | Immediate response                                                                                                                                                                                                         | Recovery boundary                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Build or deployment fails before traffic changes | Keep the current release serving; fix in a new release candidate.                                                                                                                                                          | No database change if migrations were not applied.                                              |
| New application runtime fails                    | Redeploy the previously known-good application artifact and retain logs.                                                                                                                                                   | Safe only if the applied migration is backward-compatible.                                      |
| Database connectivity failure                    | Verify deployment secret/configuration and provider status; do not rotate URLs blindly.                                                                                                                                    | App redeploy does not restore database connectivity.                                            |
| Migration fails                                  | Stop rollout, preserve Prisma output, and inspect migration history with the database owner.                                                                                                                               | Do not use `migrate reset` or hand-edit `_prisma_migrations`; recovery may require backup/PITR. |
| Administrator credentials are compromised        | Change the password through the authenticated account flow; this atomically revokes all sessions. If no administrator can authenticate, use an authorized, audited database recovery procedure to provision a replacement. | Session revocation is automatic on password change; database recovery is not.                   |
| Private or incorrect content is published        | Use the authoritative admin lifecycle/translation controls to archive or unpublish it, then confirm public readers no longer expose it.                                                                                    | Reverting an application artifact alone does not change publication state.                      |
| Incorrect `SITE_URL` or indexing setting         | Correct the deployment environment, rebuild static public pages, redeploy, then recheck robots, sitemap, canonical, and alternate URLs.                                                                                    | A runtime-only change is insufficient for statically generated metadata.                        |

## Backup and restore drill

**Status: BLOCKED.** The current guarded test runtime accepts only the active `bakanel_test` database
and rejects every other database name. It therefore cannot safely restore into a second target. Do
not restore over `bakanel_test` to simulate a drill.

Before production launch, the database/hosting owner must provide a separate isolated restore
target and authorize a drill that proves: backup capture, restore duration, migration metadata,
record identity, relationships, lifecycle states, and application connection. That drill does not
substitute for confirming production backup retention and point-in-time recovery settings.

## Business handover checklist

- Official name, branding, production hostname, and verified contact/WhatsApp details.
- Approved FR/EN/PT institutional text and legal/privacy requirements.
- Approved real catalogue hierarchy, programme translations, schedules, locations, and prices.
- Named publication authority and content-review process.
- Verified expert biographies/references and image rights.
- Hosting owner, database owner, backup/PITR owner, incident contact, and release approver.
