# Public eligibility contract

## Verified schema facts

Catalogue entities use `CatalogueStatus` and locale-specific translations with `isPublished`.
Sessions use `SessionStatus` and `@db.Date` fields for `startDate`, `endDate`, and optional
`registrationDeadline`. Experts use `ExpertStatus`; references use completed engagement status,
explicit `PUBLIC` visibility, and translated `isPublished`; articles use `ArticleStatus`,
translation publication, and `publishedAt`.

## Eligibility and locale isolation

Every public predicate takes an explicit `fr`, `en`, or `pt` locale and maps it to Prisma's
`FR`, `EN`, or `PT`. There is no fallback. Domains, topics, and trainings require a published
parent and published requested-locale translation through the full ancestry. Sessions require
an eligible training plus `OPEN` or `CLOSED` status and a future-or-today start date. Experts
must be active. References must be completed, public, and have a published locale translation.
Articles require parent publication, a published locale translation, and `publishedAt`.

## Date policy

Session fields are database calendar dates. Public availability compares their UTC calendar day
to an injected `today` value normalized to UTC midnight. Registration is session-level only:
it is open when a discoverable session is `OPEN` and its deadline is absent or today/future.
It does not independently prove training publication eligibility.

## DTO and privacy contract

`lib/public/dto.ts` defines presentation shapes without database IDs, admin data, audit fields,
or internal lifecycle states. Training and article translations have verified locale slugs.
Sessions, experts, and references have no independently verified public slugs in the schema;
future readers must not invent them.

## Implemented training reader

`createPublicTrainingReader()` provides locale-explicit domain and topic lists, training lists,
training detail by requested-locale slug, and alternate-locale slugs. It selects only translated
presentation fields and maps them to DTOs without identifiers. Domain lists are capped at 48;
topic and training lists use offset pagination with a default of 12 and maximum of 48. Taxonomy
lists sort by display order and internal tie-breaker. A localized slug is mutable in V1, so
historic URLs are not preserved. Mocked query-shape unit tests run without a database;
PostgreSQL integration coverage is described under "PostgreSQL integration verification".

### Training DTOs (BAK-PUBLIC-4B)

- **`PublicTrainingDto`** (catalogue card, homepage preview): `slug`, `title`, `summary`,
  `domain: { name, slug }`, `topic: { name, slug }`.
- **`PublicTrainingDetailDto`** (programme detail): the card plus `description`, `objectives`,
  `targetAudience`, and `program`. These are the actual `TrainingTranslation` columns; there is
  no separate "programme content" field beyond `program`.
- **`PublicTrainingAlternateDto`**: `{ locale, slug }`, where `locale` is a public locale code.

Optional sections (`summary` and the four detail sections) are `null` when the requested
locale's translation leaves them empty or whitespace-only, so presentation can omit them. A
section is never filled from another locale. No DTO carries IDs, statuses, `isPublished`,
display order, foreign keys, or audit timestamps.

### Taxonomy labels

Card and detail labels come from the training's own topic and that topic's domain, each through
a nested `select` restricted to the requested locale and `isPublished: true` with `take: 1`. The
query's `where` is still `publicTrainingWhere(locale)`, which already requires the topic and
domain to be `PUBLISHED` with a published requested-locale translation, so a published training
never exposes an unpublished or other-locale parent label. If a label is nonetheless missing
when the row is mapped (for example, a concurrent unpublish), the row is dropped rather than
shown without taxonomy. Labels are loaded in the same `findMany`/`findFirst` as the training,
so there is no per-row query.

### Catalogue ordering

`listPublicTrainings` orders by:

1. `TrainingDomain.displayOrder` ascending, then the domain's internal ID;
2. `TrainingTopic.displayOrder` ascending, then the topic's internal ID;
3. `Training.createdAt` ascending, then the training's internal ID.

Each level ends with a unique tie-breaker, so a fixed dataset produces one sequence and offset
pages are deterministic; programmes of the same domain (and topic) stay contiguous even when
display orders tie. IDs are never returned. The homepage preview uses the same reader and
order, so it shows the first eligible programmes of the highest-priority domain.

The preferred business order (Assurance, Gestion de projet, Statistique) is configuration, not
code: administrators set each domain's existing, admin-editable "Ordre d'affichage" (for
example 10, 20, 30). The reader never compares translated names, and the static
`lib/public/training-domains.ts` keys are institutional positioning content with no link to
`TrainingDomain` rows. Until display orders are set, equal values fall back to internal-ID
order, which is stable but not meaningful. No schema change was needed.

### Programme detail

`getPublicTrainingBySlug(locale, slug)` validates the locale first (an unsupported locale throws
even for an empty slug), trims the slug, and returns `null` without querying when it is empty.
Otherwise it combines the full public predicate with the requested locale, the slug, and
`isPublished: true`, and selects only that translation. Draft, archived, unpublished-ancestor,
unpublished-translation, and other-locale slugs return `null`.

### Alternate-locale slugs

`listPublicTrainingAlternates(locale, slug)` returns the published slugs of the same programme
in the other public locales, in `fr`, `en`, `pt` order, excluding the requested locale. It runs
one `findFirst` per other locale (two queries) whose `where` is
`AND: [eligibleSource, publicTrainingWhere(target)]`: the source slug must be eligible in the
requested locale, and the training, topic, domain, and their translations must also be published
in the target locale. Only the target translation's `slug` is selected. A locale that fails any
condition is absent; the reader never assumes slugs match across languages and never falls back
to an unpublished translation. An empty slug returns `[]` without querying; an unsupported
locale throws. When a locale is absent, the future language selector should link to that
locale's catalogue overview. The selector itself is unchanged.

### Historical-data limitations

Completed sessions keep their `trainingId` relationship (`onDelete: Restrict`), but no
historical snapshot of the programme title, slug, domain, or topic is stored. Readers show the
current published translation and taxonomy; renaming, re-slugging, moving a training to another
topic, or archiving it changes what is shown for its past sessions. There are no slug redirects.

## Implemented session reader

`createPublicSessionReader()` provides `listPublicUpcomingSessions(locale, options)` and
`listPublicUpcomingSessionsForTraining(locale, trainingSlug, options)`. Both use the shared
session predicate: only `OPEN` or `CLOSED` sessions starting today or later are discoverable,
and their training, topic, domain, and requested-locale translations must all be published. The
training-specific reader adds the requested locale's published training slug inside that database
predicate. Sessions do not have independent public slugs, so this contract deliberately offers no
session detail reader.

`registrationOpen` is derived, never persisted or mutated. It is true only for an `OPEN` session
that has not started before the UTC calendar day and whose deadline is absent or is that day or
later. A discoverable `CLOSED` session, or an `OPEN` session with an expired deadline, remains in
the listing with `registrationOpen: false`. Readers accept an injected clock and use the same UTC
calendar-day policy for query eligibility and that derived flag.

The session DTO exposes a localized training title and slug; dates; delivery mode; country, city,
and venue; pricing mode, fixed price serialized as a string when present, and currency; plus the
registration deadline and derived availability. It excludes database IDs, status, audit fields,
capacity, and raw records. Lists use offset pagination (default 12, maximum 48) and stable
`startDate`, then internal-ID ordering. Offset pages can shift as sessions are scheduled or
changed; database IDs remain an internal tie-breaker and are not returned. These are mocked
query-shape/unit tests; PostgreSQL integration coverage is described under "PostgreSQL
integration verification".

## Shared pagination

`lib/public/pagination.ts` holds the offset pagination used by the expert, reference, and article
readers: default 12, maximum 48. A missing, non-integer, or non-positive limit falls back to 12;
a missing, non-integer, or negative offset falls back to 0. Every list orders by a unique internal
ID as its final tie-breaker, so pages are deterministic for a fixed dataset; the ID is never
returned. Offset pages can still shift when records are published, archived, or reordered
between requests, and deep offsets cost more than keyset pagination would.

## Implemented expert reader

`createPublicExpertReader()` provides `listPublicExperts(locale, options)`. The database query
uses `publicExpertWhere(locale)`: status `ACTIVE` and a published translation in the requested
locale. The explicit projection selects `name` and `portraitReference` from `Expert`, and only
the requested locale's published `professionalTitle`, `specialization`, and `biography`. The DTO
is `PublicExpertDto` with exactly those five fields; it carries no IDs, status, display order,
audit fields, or contact data (the schema holds no expert contact fields). Ordering is
`displayOrder`, then `name`, then internal ID.

The schema has no expert public slug. This contract does not invent one and deliberately offers
no expert detail reader; a database ID is not a public identifier. V1 presents experts as a
listing or institutional section.

## Implemented reference reader

`createPublicReferenceReader()` provides `listPublicReferences(locale, options)`. The complete
`publicReferenceWhere(locale)` predicate runs inside the Prisma query: `COMPLETED` status,
explicit `PUBLIC` visibility, and a published requested-locale translation whose title is not
empty. Private and draft engagements are never fetched and filtered afterward, and the reader
issues no count query, so no private totals reach the caller.

A client organization is exposed only through an eligible engagement, and only its `name` and
`logoReference`. `ClientOrganization.isActive` is not required: an inactive organization's
completed public engagement remains a valid historical reference, and the domain defines no
separate organization-level publication consent. Country, activity flag, IDs, engagement type,
dates, and other administrative metadata are not returned. The DTO is `PublicReferenceDto`:
`organizationName`, `organizationLogoReference`, `title`, `description`. Ordering is `endDate`
descending with missing end dates last, then internal ID.

References have no public slug, so there is no reference detail reader. V1 presents eligible
references as a listing. Publication requires explicit `PUBLIC` visibility; completion alone
never makes an engagement a public reference.

## Implemented article reader

`createPublicArticleReader()` provides `listPublicArticles(locale, options)` and
`getPublicArticleBySlug(locale, slug)`. Both use `publicArticleWhere(locale)` inside the query:
status `PUBLISHED`, non-null `publishedAt`, and a published requested-locale translation.

Lists return `PublicArticleSummaryDto` (slug, title, excerpt, cover reference, `publishedAt`),
which omits the full article body to keep list payloads small. Ordering is `publishedAt`
descending, then internal ID.

Detail lookup trims the slug and returns `null` without querying when it is empty. Otherwise the
requested locale, the slug, and `isPublished: true` are combined with the full publication
predicate in one `findFirst`. Draft, archived, untimestamped, missing-translation,
unpublished-translation, and other-locale slugs all return `null`. Only the matched translation
is selected; alternate-language slugs, including unpublished ones, are never returned. The
detail DTO is `PublicArticleDto`. Localized slugs are unique per locale and editable in V1, so
historic article URLs are not preserved after a slug change. Readers never change `publishedAt`;
the article service keeps the original timestamp on archive and republication.

## Media-reference trust limitation

`portraitReference`, `logoReference`, and `coverReference` are free-text administrative fields,
returned as stored. They are not validated URLs. Rendering them requires a separate trust and
validation policy; see "Media-reference rendering policy" below. Until that policy is implemented,
pages must not pass them directly to `next/image`, `src`, or `href` attributes. This contract
introduces no media provider.

## Canonical public data-access layer

`lib/public/` is the only public data-access layer: `training.read.ts`, `session.read.ts`,
`expert.read.ts`, `reference.read.ts`, and `article.read.ts`, built on `eligibility.ts`, `dto.ts`,
`locale.ts`, and `pagination.ts`. Public routes must read published content only through these
modules. Admin screens keep using the authenticated `lib/admin/*.read.ts` readers.

### Removed legacy readers (BAK-PUBLIC-2F)

BAK-PUBLIC-2F deleted four prototype modules that predated this contract:

- `lib/catalogue.read.ts`, `lib/expert.read.ts`, `lib/client-work.read.ts`, and `lib/article.read.ts`.
- Their dedicated tests: `test/catalogue.read.test.ts`, `test/expert.read.test.ts`,
  `test/client-work.read.test.ts`, and `test/article.read.test.ts`.

They used unrestricted `include`, returned raw Prisma models (IDs, foreign keys, statuses, audit
timestamps, and the whole `ClientOrganization`), had no result bounds, and the article prototype
did not require `publishedAt`. Their export names (`publicArticleReader`, `publicExpertReader`)
duplicated the supported readers and invited mistaken imports.

Before deletion a repository-wide search found no application, script, route, re-export,
dynamic, or type-only import; only the four dedicated tests used them. No compatibility wrappers
were added. The validation helpers they called (`assertLocale`, `assertExpertLocale`) remain in
use by the admin services.

## Locale mapping fails closed

`toPrismaLocale()` throws `Unsupported public locale.` for any value other than `fr`, `en`, or
`pt`. Previously an unvalidated runtime value (for example `"de"` cast to `PublicLocale`) mapped
to `undefined`, which Prisma treats as an omitted filter, so a predicate silently matched a
published translation in any locale. Routes already reject unsupported locales with
`isPublicLocale()`, so no reachable page was affected; the mapper is now defence in depth, and
the error message contains no data.

## Public-reader security audit (BAK-PUBLIC-2E)

Reviewed every query and DTO in `lib/public/`:

- **Projections.** Every reader uses an explicit `select`; none uses `include` or returns a raw
  model. DTOs are built field by field. Internal IDs appear only in `orderBy` tie-breakers and are
  never selected.
- **Translations.** Every nested translation select repeats the requested locale and
  `isPublished: true`, with `take: 1`. There is no cross-locale fallback; a row whose translation
  is missing is dropped rather than filled from another locale.
- **Eligibility.** All eligibility runs in the database `where`. Slug lookups spread the full
  predicate and then narrow `translations` to the same locale plus the slug and
  `isPublished: true`, so ancestry and parent status still apply. References are never fetched
  as `PRIVATE` or `DRAFT`, and no reader runs a count.
- **Input.** Slugs are trimmed, empty slugs return without querying, and values reach
  PostgreSQL only as Prisma parameters. Lookups are case-sensitive exact matches. Pagination
  normalizes negative, fractional, `NaN`, and oversized values.
- **Bounds.** Lists are capped at 48 rows. The domain list has no offset and silently truncates
  beyond 48 domains.
- **Errors.** Readers do not catch Prisma errors, and Next.js error boundaries hide their details
  in production.
- **Relations.** Traversal is limited to catalogue ancestry, session → training, and
  engagement → organization (`name` and `logoReference` only).

Residual items: article `content` and every translated text field are plain stored text and must
be rendered as escaped text, never through `dangerouslySetInnerHTML`. Reference titles consisting
only of whitespace pass the database predicate; the services already trim titles on save.

## Media-reference rendering policy (proposed, not implemented)

`Expert.portraitReference`, `ClientOrganization.logoReference`, and `Article.coverReference` are
free text. Services only trim them and convert blanks to `null`; nothing validates their shape.
Readers return them unchanged. A future presentation helper should apply this policy before any
value reaches `src`, `href`, or `next/image`:

1. **Missing values.** Treat `null`, empty, or whitespace-only values as missing and render the
   institutional placeholder (or nothing).
2. **Local assets.** Accept a root-relative path only when it begins with `/images/`, contains no
   `..`, backslash, `//`, query string, or fragment, and ends in `.png`, `.jpg`, `.jpeg`, or
   `.webp`. Restrict `next/image` to that folder with `images.localPatterns`.
3. **Remote assets.** Accept an absolute URL only if `new URL()` parses it, its protocol is
   `https:`, it has no credentials, and its host matches an explicit allowlist mirrored in
   `images.remotePatterns`. No remote host is approved today, so every absolute URL is rejected
   until the media provider is chosen.
4. **Rejected schemes.** Reject `javascript:`, `data:`, `blob:`, `file:`, `http:`, `vbscript:`,
   and every other scheme, along with protocol-relative (`//host`) and bare relative values (no
   leading `/`).
5. **SVG.** Keep `dangerouslyAllowSVG` disabled; SVG logos need a separate decision.
6. **Invalid values.** Treat any rejected value as missing; never pass it through, and do not
   log the value itself on public requests.

`next.config.ts` currently has no `images` configuration, so `next/image` would reject remote
URLs. Do not use `unoptimized` to bypass that.

## Pagination and mutable slugs

Offset pagination is stable only for a fixed dataset: a publication, archive, or reorder between
requests can shift or repeat items across pages. Deep offsets scan more rows than keyset
pagination would. Training and article slugs are editable in V1 and there is no redirect
history, so an old localized URL returns not-found after a slug change.

## PostgreSQL integration verification

**Status: executed (BAK-PUBLIC-2E.1).** All five public reader families run against a real
local PostgreSQL 14 database (`bakanel_test`) through the actual Prisma client and the
production reader factories, using the `@prisma/adapter-pg` driver adapter. The mocked
query-shape tests in `test/public-*.test.ts` remain unit tests and are not integration
coverage.

No production or shared-development database was accessed. The Neon `DATABASE_URL` and
`DIRECT_URL` were never connected to; they are read only so the guard can compare endpoints.

### Test database requirements

- **Server.** A local PostgreSQL server reachable on `localhost`, `127.0.0.1`, or `::1`.
- **Database.** A dedicated, disposable database named exactly `bakanel_test`, used by nothing
  else.
- **Connection string.** `TEST_DATABASE_URL`, kept in the git-ignored `.env` (placeholder in
  `.env.example`).
- **Dev dependencies.** `@prisma/adapter-pg` (7.10.0, matching `@prisma/client`), `pg`, and
  `@types/pg`. The application keeps using `@prisma/adapter-neon`; `lib/prisma.ts` and
  `prisma7.config.ts` are unchanged.

### Setup

```sh
createdb -h localhost bakanel_test   # once; never drop or reuse another database
# .env
TEST_DATABASE_URL="postgresql://USER@localhost:5432/bakanel_test"
pnpm test:integration
```

`pnpm test:integration` runs `vitest.integration.config.mts`. Its global setup, in order:

1. Runs the guard.
2. Opens a `pg` connection and confirms `current_database()` is `bakanel_test`.
3. Runs `prisma migrate deploy --config prisma.test.config.ts`, which only applies the committed
   migrations and never resets.

The test config calls the guard itself, so running Prisma directly with that config also fails
closed. If the server is down the command fails with "The integration test database is
unavailable". `pnpm test` excludes `test/integration/**` and stays database-free.

### Guard behavior

`test/integration/support/test-database-guard.ts` rejects, before any connection or mutation:

- **Missing or invalid URL.** A missing, blank, or malformed `TEST_DATABASE_URL`, or a scheme
  other than `postgres:`/`postgresql:`.
- **Neon.** Any value containing `neon`.
- **Non-loopback host.** Any host other than `localhost`, `127.0.0.1`, or `::1`.
- **Wrong database.** Any database name other than exactly `bakanel_test`.
- **Redirecting parameters.** Any query parameter except `sslmode`, `connect_timeout`,
  `application_name`, or `schema`. This blocks `host=`, `hostaddr=`, `port=`, `dbname=`,
  `options=`, and similar parameters that libpq-style drivers honor over the URL host.
- **Application overlap.** Any URL equal to `DATABASE_URL` or `DIRECT_URL`, or resolving to the
  same normalized endpoint. Endpoint comparison treats all loopback spellings as one host and a
  missing port as 5432.

Error messages never include the connection string. Each integration client is built by
`createTestPrismaClient()`, which re-runs the guard. In the integration config `@/lib/prisma` is
aliased to a stub that throws on use, so a reader cannot fall back to the application singleton;
a test asserts this. Before each test, `resetPublicContent()` re-checks `current_database()` and
truncates only the explicit list of public-content tables (never `AdminUser`, `AdminSession`,
`AdminLoginAttempt`, or `_prisma_migrations`). Fixture text values start with `it-`. Rows from the
final test remain in `bakanel_test` until the next run.

Guard behavior is covered by `test/test-database-guard.test.ts` in the unit suite. Running
`pnpm test:integration` with Neon, remote, wrong-database, `host=`, `hostaddr=`, app-identical,
malformed, empty, and unreachable URLs was also checked by hand; each exits non-zero before any
migration or fixture write.

### Cases verified against PostgreSQL

- **Catalogue (`public-catalogue.int.test.ts`).**
  - A published domain appears only in locales whose translation is published.
  - Draft and archived domains are excluded.
  - A published topic under a draft domain, and a published training under a draft topic, are
    hidden both in lists and by slug.
  - An unpublished requested-locale translation prevents discovery and slug resolution.
  - A slug resolves only in its own locale and returns only that locale's fields.
  - Pagination with identical `createdAt` values is stable and ID-ordered.
  - The domain list caps at 48 rows.
  - An unsupported locale is rejected.
- **Programme catalogue (`public-training-catalogue.int.test.ts`, BAK-PUBLIC-4B).**
  - Detail returns every modeled section and the requested locale's taxonomy labels, with no
    IDs, statuses, or timestamps.
  - Missing and whitespace-only optional sections are `null`; no other locale is borrowed.
  - Draft and archived programmes are hidden from lists, detail, and alternates and remain
    stored.
  - An unpublished requested-locale topic or domain translation, or an archived domain, hides
    the programme.
  - Ordering follows domain display order, topic display order, then creation time across
    pages; tied display orders keep each domain contiguous; the homepage preview follows the
    same order.
  - Alternates include only target locales whose training translation and full ancestry are
    published; unpublished translations, wrong-locale slugs, and draft ancestors yield none.
  - Unsupported locales are rejected for detail and alternates.
- **Sessions (`public-session.int.test.ts`, clock fixed at 2026-10-08T23:30Z).**
  - Upcoming `OPEN` and `CLOSED` sessions appear.
  - `CLOSED` and expired-deadline sessions remain listed with `registrationOpen: false`.
  - A deadline of today and a start of today stay valid under `@db.Date` UTC semantics, and dates
    round-trip as UTC midnight.
  - Past, `DRAFT`, `CANCELLED`, and `COMPLETED` sessions are excluded and remain stored.
  - Unpublished ancestry hides sessions.
  - The training-specific lookup honors only the requested locale's published slug.
  - Fixed `Decimal` prices serialize to strings, and `ON_REQUEST` never exposes a stored amount.
  - The DTO has exactly the documented keys.
- **Experts (`public-expert.int.test.ts`).**
  - `ACTIVE` experts with a published requested-locale translation appear in display order.
  - Inactive, unpublished, and other-locale-only experts are excluded.
  - The DTO carries only the requested locale's presentation.
  - An inactive expert's historical session assignment remains.
- **References (`public-reference.int.test.ts`).**
  - Only `COMPLETED` and `PUBLIC` engagements with a published nonempty locale title appear;
    private, draft-public, unpublished, empty-title, and other-locale engagements are excluded.
  - An inactive organization's completed public engagement stays visible.
  - Adding private engagements leaves results unchanged.
  - Only organization name, logo, title, and description are returned.
  - Ordering is `endDate` descending with nulls last, then ID.
- **Articles (`public-article.int.test.ts`).**
  - Draft, archived, null-`publishedAt`, unpublished-translation, other-locale, and guessed slugs
    are excluded from lists and return `null` from detail lookups.
  - A slug resolves only in its own published locale.
  - The summary omits the body, and the detail adds only `content`.
  - Ordering is `publishedAt` descending with an ID tie-breaker across pages.
  - Reads leave `publishedAt`, slugs, and archived status unchanged.
  - Unsupported locales are rejected for both list and detail.
  - The application singleton cannot be used.

### Observed PostgreSQL behavior

Prisma returns `Decimal(18,2)` prices without trailing zeros: a stored `150000.00` becomes
`"150000"` and `150000.50` becomes `"150000.5"`. The mocked unit test assumed `"150000.00"`. The
value is exact and the DTO contract only promises a string, so the reader is unchanged;
presentation code must format prices for display (XOF has no minor unit) and must not rely on
two decimal places.

### Remaining gaps

- **Not covered against PostgreSQL:** topic pagination, `listPublicTrainingTopics` locale
  isolation (it shares the verified predicate builders), and Portuguese for every family.
- **Concurrency:** offset-page behavior under concurrent writes is untested.
- **Other PostgreSQL versions:** the suite has been run on PostgreSQL 14 only. Neon runs a newer
  version, and nothing in the queries is version-specific.
- **Migration drift:** the suite applies migrations with `migrate deploy` and does not diff the
  live schema against `schema.prisma`.

## Historical preservation and boundaries

Public readers only read. They never mutate statuses, dates, translations, visibility, or
historical records. Inactive experts keep their session assignments; completed engagements,
including private ones, remain stored; organization relationships are untouched; archived
articles, unpublished translations, original `publishedAt` values, and existing localized slugs
remain unchanged. Existing service validation trims and rejects blank translation titles; the
reference query also rejects the empty-string legacy case.

Each reader family was re-audited for this (BAK-PUBLIC-2E): catalogue readers do not alter
archived or draft taxonomy; session readers leave past, cancelled, and completed sessions and
their expert assignments in place; expert readers leave inactive experts and their assignments
in place; reference readers leave private engagements, completed engagement facts, and
organization relationships in place; article readers leave archived articles, unpublished
translations, `publishedAt`, and localized slugs in place. No reader issues a write.
