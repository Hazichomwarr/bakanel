<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# W'BAKENEL Engineering Contract

## Architecture and domain integrity

Before substantial work, inspect existing patterns and relevant domain documentation,
identify the authoritative domain service and affected historical invariants, and choose
the smallest implementation scope. Reuse the established architecture unless a change is
justified; do not add abstractions for their own sake.

Before a domain change, explicitly answer: **What historical information must this change
preserve?** `docs/domain-model.md` is the domain reference, reconciled with implemented
services and tests. Preserve training/session lifecycle history, expert assignments,
completed engagements, translations, visibility, editorial lifecycle, and stale-state
protections. Admin actions authenticate before mutation and never bypass domain services
with direct Prisma writes. Schema changes and migrations require explicit authorization.

## Readability, boundaries, and tests

Use descriptive names, multiline imports, conventional indentation, readable calls and
object literals, straightforward React components, and clear error handling. Avoid
compressed modules, unrelated statements on one line, cryptic abbreviations, dense mocks,
nested ternaries, and clever abstractions that hide domain behavior.

Maintain the route/page → admin action/reader → domain service → Prisma boundary. Readers
use explicit projections, deterministic ordering, and bounded collections where appropriate.
Tests are readable behavior documentation: use clear setup/action/assertion, meaningful
negative cases, focused boundary coverage, and regression tests. Do not claim mocked tests
prove database behavior; distinguish unit, mocked transaction, and database integration tests.

## Change and completion discipline

Keep tickets narrow. Do not change domain semantics, add speculative features or dependencies,
create permanent synthetic Neon data, redesign the institutional UI, or commit unless asked.

Run the applicable final gates on the final tree: `pnpm format:check`, `pnpm test`,
`pnpm prisma validate`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. Report
changed files, results, database impact, and limitations accurately.
