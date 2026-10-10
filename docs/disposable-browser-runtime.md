# Disposable browser runtime

`pnpm dev:disposable` starts the local Next.js application with the PostgreSQL adapter, but only
after the shared disposable-database guard approves `TEST_DATABASE_URL`.

```sh
pnpm dev:disposable -- -p 3013
```

The server binds to `127.0.0.1` by default. `next dev` otherwise listens on every network
interface, which would expose the synthetic administrator and the disposable database to the
local network. An explicit `-H`/`--hostname` is accepted only for `127.0.0.1`, `localhost`, or
`::1`; any other value stops the command before Next.js starts. No current workflow requires a
non-loopback binding.

This command is intentionally separate from `pnpm dev`. It sets
`BAKANEL_DISPOSABLE_DATABASE=1`; a local-looking database URL, `NODE_ENV=test`, or any other
environment setting cannot select the PostgreSQL adapter by itself.

The guard rejects production mode, Neon and remote hosts, non-`bakanel_test` database names,
redirecting connection parameters, and any endpoint that overlaps `DATABASE_URL` or `DIRECT_URL`.
Normal development and production continue using the Neon adapter.

Use this runtime only with the existing guarded fixture utilities. Stop it with `Ctrl+C`. After
browser acceptance, run `pnpm test:integration` to reset public fixture tables on the guarded
database, or use the existing guarded fixture reset from an integration-only harness. Never place
test credentials in tracked environment files or override `DATABASE_URL` for this workflow.
