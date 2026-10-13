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
- **Node runtime: Node 22.x is required.** The inspection shell used Node `v22.23.2`; earlier
  verification also used Node `v20.20.0`. The project now pins `engines.node` to `22.x`, which
  passed the unit suite. Select Node 22.x in Vercel Project Settings too.
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

## Vercel project setup and environment isolation

1. Create or select the Vercel project and connect the approved repository. Set `main` as the
   Production Branch. Vercel uses `pnpm build` through the project build command; do not configure
   `pnpm start`, because Vercel runs the generated Next.js functions rather than a persistent
   application process.
2. Set Vercel's Node.js version to **22.x**. The matching `package.json` engine prevents a future
   default Node major from silently changing the build/runtime.
3. Set Production variables only after the owner has approved the real hostname and Neon
   connection. A variable update needs a new deployment before it takes effect.
4. Leave `SITE_URL` unset in Preview. The existing robots implementation then disallows indexing
   and sitemap routes return 404. Do not set Preview `DATABASE_URL` to Production Neon.
5. Until a separate, non-production Neon branch/database is provisioned, leave Preview
   `DATABASE_URL` unset. This deliberately makes database-backed Preview pages unavailable rather
   than allowing administrative or public reads/writes against production data. If preview data
   access is required later, configure a distinct branch-specific Preview URL, with synthetic or
   approved non-production data only.
6. Keep the Vercel function region close to the chosen Neon region, and perform a connection-load
   check before launch. The app uses Neon’s serverless Prisma adapter in Node functions; it does
   not rely on in-memory sessions or a persistent process.

### Vercel environment-variable matrix

| Variable                           | Purpose                                                                           | Required           | Build/runtime                                                       | Vercel scope                                       | Secret | Validation / safe value                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- | -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                         | Authoritative canonical, alternate, robots, and sitemap origin                    | Production only    | Build and runtime                                                   | Production only                                    | No     | Must be verified HTTPS origin-only URL. Leave unset in Preview/Development to keep indexing disabled.               |
| `DATABASE_URL`                     | Neon connection used by the Node Prisma-Neon adapter                              | Production runtime | Runtime; make available to build if Vercel evaluates server modules | Production only until isolated Preview Neon exists | Yes    | Required by Prisma initialization; never use `bakanel_test` or share Production URL with Preview.                   |
| `ADMIN_CLIENT_IP_HEADER`           | Optional trusted-proxy IP header for the secondary login throttle                 | No                 | Runtime                                                             | Production only after header behavior is verified  | No     | Leave unset by default; per-account throttling remains active.                                                      |
| `TEST_DATABASE_URL`                | Guarded local integration-test PostgreSQL target                                  | Never on Vercel    | Local test only                                                     | Development workstation only                       | Yes    | Must be loopback `bakanel_test`; guard rejects Neon, remote hosts, wrong names, and overlap.                        |
| `BAKANEL_DISPOSABLE_DATABASE`      | Explicit opt-in for local disposable browser runtime                              | Never on Vercel    | Local test only                                                     | Development workstation only                       | No     | Must equal `1`; runtime independently rejects it when `NODE_ENV=production`.                                        |
| `DIRECT_URL`                       | Not consumed by the application; only compared by the disposable guard if present | No                 | Separate authorized migration environment only                      | Do not configure for normal Vercel deployments     | Yes    | Never point it at the disposable target; no production migration is run by the Vercel build.                        |
| Authentication/session secret      | Not applicable in V1                                                              | No                 | N/A                                                                 | N/A                                                | N/A    | Sessions use random server-generated tokens, stored only as hashes in PostgreSQL; no configured auth secret exists. |
| Email/external-service credentials | Not applicable in V1                                                              | No                 | N/A                                                                 | N/A                                                | N/A    | No email or external credential is declared in the repository.                                                      |

Vercel system variables such as `VERCEL_URL` must not be substituted for `SITE_URL`: they identify
deployment URLs, while this application requires the owner-approved canonical production origin.

### Migrations with Vercel and Neon

Vercel builds run `prisma generate` through `pnpm build`; they must **not** run migrations. For an
approved release, an operator runs the migration commands from the separate restricted migration
environment described above, using a direct migration-capable Neon/PostgreSQL URL. Record the
target endpoint, migration status, backup reference, operator, and release SHA. Only after that
operation succeeds may the already-approved Vercel production deployment be promoted.

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
