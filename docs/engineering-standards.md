# Engineering standards

`AGENTS.md` is the default engineering contract for Codex and contributors. Read it before
substantial work, then preserve the service-layer domain rules described in
`docs/domain-model.md`.

## Formatting

Prettier owns formatting and ESLint owns correctness and code-quality checks. Use `pnpm format`
to format the current tracked engineering baseline and `pnpm format:check` to verify it. Both
commands intentionally cover only the engineering configuration and documentation introduced by
BAK-ENG-1. Generated output, dependencies, build artefacts, and the lockfile are excluded.

This narrow baseline prevents a repository-wide formatting rewrite. Existing application files
are formatting debt; future tickets must format every file they create or modify before review.
Run Prettier explicitly on those selected files, for example:

```sh
pnpm exec prettier --write app/admin/example/page.tsx lib/example.service.ts
```

## Acceptance checks

Before accepting a ticket, run `pnpm format:check`, `pnpm test`, `pnpm prisma validate`,
`pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. Domain services remain authoritative:
admin actions must authenticate and delegate business writes rather than mutate Prisma directly.
