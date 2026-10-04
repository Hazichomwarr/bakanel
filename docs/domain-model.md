# BAKENEL Domain Model

**Status:** Approved  
**Scope:** V1  
**Purpose:** Canonical business-domain authority for the BAKENEL application.

---

## 1. Purpose

This document defines the business meaning, ownership boundaries, lifecycle rules, relationships, and historical invariants of BAKENEL.

Implementation code, database schemas, admin workflows, and future tickets must conform to this document.

Before implementing any substantial domain change, ask:

> **What historical information must this change preserve?**

Do not change a domain invariant merely to simplify implementation.

---

## 2. Domain Principles

BAKENEL distinguishes between:

1. Reusable business concepts
2. Scheduled or completed business events
3. Editorial content
4. Authentication identities
5. Static website content

These categories have different lifecycle and historical requirements.

The general deletion rule is:

> **Delete drafts. Archive established business concepts. Preserve historical records.**

Historical facts must not be silently rewritten because the current catalogue, organization, expert roster, or website presentation changes.

---

## 3. Domain Overview

```text
BAKENEL
│
├── TRAINING CATALOGUE
│   ├── TrainingDomain
│   ├── TrainingTopic
│   └── Training
│
├── TRAINING DELIVERY / HISTORY
│   └── TrainingSession
│
├── PEOPLE
│   └── Expert
│
├── CLIENT WORK
│   ├── ClientOrganization
│   └── ClientEngagement
│
├── EDITORIAL
│   └── Article
│
└── SECURITY
    └── AdminUser
```

Static institutional website content is intentionally outside the database.

---

## 4. Training Catalogue

### 4.1 TrainingDomain

A `TrainingDomain` is a durable top-level classification of BAKENEL's training expertise.

Examples:

- Assurances
- Gestion de projets
- Statistiques

A domain may contain multiple `TrainingTopic` records.

#### Lifecycle

A domain may initially exist as a draft or unpublished concept.

Once it is used by established catalogue content, it should be archived/hidden rather than destructively deleted.

#### Translation

Public domain content may be translated independently into:

- FR
- EN
- PT

Translation availability does not determine the identity of the domain.

---

### 4.2 TrainingTopic

A `TrainingTopic` organizes training products inside a `TrainingDomain`.

Examples under `Assurances`:

- Assurance automobile
- Assurance maladie
- Réassurance
- Cyber-risques
- Incendie et risques annexes

Each topic belongs to exactly one domain.

A topic may contain multiple `Training` records.

#### Lifecycle

Once referenced by established training content, a topic should be archived/hidden rather than destructively deleted.

#### Translation

Topic presentation content may exist independently in FR, EN, and PT.

---

### 4.3 Training

A `Training` represents a reusable educational product.

Example:

```text
Domain:
Assurances

Topic:
Assurance automobile

Training:
Gestion et règlement des sinistres automobiles
```

A `Training` is **not** a scheduled occurrence.

It describes what BAKENEL teaches, rather than when or where a particular delivery takes place.

#### Training content

A training may contain translated content such as:

- title
- summary
- description
- objectives
- target audience
- program

#### Lifecycle

Conceptual lifecycle:

```text
DRAFT → PUBLISHED → ARCHIVED
```

An established `Training` should be archived rather than deleted.

#### Translation

A `Training` exists once regardless of language.

Conceptually:

```text
Training
├── FR translation
├── EN translation
└── PT translation
```

Translations may be published independently.

For example:

```text
FR    available
EN    unavailable
PT    unavailable
```

Missing English or Portuguese translations must not prevent the French Training from being published.

---

## 5. TrainingSession

A `TrainingSession` represents an actual scheduled delivery of a `Training`.

Example:

```text
Training:
Gestion et règlement des sinistres automobiles

Session:
12–14 November 2026
Ouagadougou
150,000 XOF
25 places
```

The same `Training` may have many sessions.

For example:

```text
Training
├── Ouagadougou — November 2026
├── Bobo-Dioulasso — February 2027
└── Luanda — June 2027
```

Multiple sessions of the same Training may occur concurrently.

### 5.1 Session-owned information

Information describing the actual delivery belongs to the session rather than the abstract Training.

This includes:

- start date
- end date
- registration deadline
- delivery mode
- country
- city
- venue
- pricing mode
- price
- currency
- capacity
- assigned trainers

### 5.2 Delivery mode

Supported conceptual modes:

```text
IN_PERSON
ONLINE
```

For an `IN_PERSON` session, physical location information may be required.

For an `ONLINE` session, physical venue information is not required.

This V1 `ONLINE` value represents a scheduled remotely delivered session.

It does **not** represent the future self-paced BAKENEL Learning product.

### 5.3 Pricing

Pricing is primarily a property of the session.

Supported conceptual pricing modes:

```text
FIXED
ON_REQUEST
```

For `FIXED`, a valid price is required.

For `ON_REQUEST`, the public interface displays equivalent language such as **"Sur devis"**.

Do not represent "Sur devis" using a zero price.

A `Training` itself must not assume that all of its sessions have the same price.

### 5.4 Capacity

A session may have a capacity, for example:

```text
capacity = 25
```

V1 registration occurs through WhatsApp.

Therefore BAKENEL does **not** have an authoritative registration ledger and must not infer or advertise exact remaining availability such as:

```text
7 places restantes
```

unless a future feature introduces authoritative registration tracking.

Capacity is informational in V1.

### 5.5 Trainers

A session may be delivered by one or multiple `Expert` records.

The relationship is many-to-many.

Even though multiple trainers may be uncommon, the domain must support them.

The trainer assignment on a completed session is historical information.

### 5.6 Session lifecycle

Conceptual lifecycle:

```text
                  ┌──→ CANCELLED
                  │
DRAFT → OPEN → CLOSED → COMPLETED
```

A cancelled session remains in the system as `CANCELLED`.

Cancellation is history, not deletion.

### 5.7 Session immutability

Once a session becomes `COMPLETED`, its historical business facts become read-only.

This includes information such as:

- Training identity
- dates
- delivery mode
- location
- price
- currency
- capacity
- trainers

A completed session must not change merely because the current Training catalogue or Expert roster changes.

Completed sessions are historical records.

Cancelled sessions must likewise be preserved rather than deleted.

If a future requirement permits correction of historical data, it must be implemented as an explicit administrative correction mechanism rather than ordinary editing.

---

## 6. Expert

An `Expert` represents a professional associated with BAKENEL's expertise or training delivery.

An Expert is a business identity.

An Expert is **not** automatically an authenticated application user.

An Expert may exist publicly without having login credentials.

### 6.1 Expert profile

An Expert may contain:

- professional identity
- portrait reference
- title/specialization
- biography/profile
- translated public presentation
- active/inactive state

### 6.2 Expert lifecycle

When an Expert stops working with BAKENEL, the Expert may become:

```text
INACTIVE
```

An inactive Expert may disappear from the current public **"Nos experts"** directory.

However, historical relationships must remain intact.

Example:

```text
2026 completed session
Trainer: Expert A

2028
Expert A leaves BAKENEL
```

The 2026 session must continue to identify Expert A as its trainer.

An Expert with historical relationships must not be deleted merely because they are no longer active.

---

## 7. ClientOrganization

A `ClientOrganization` represents an organization that has worked with BAKENEL.

Example:

```text
STAR ASSURANCES DU TCHAD
```

The organization itself is distinct from work performed for it.

One organization may have multiple engagements.

```text
ClientOrganization
├── ClientEngagement A
├── ClientEngagement B
└── ClientEngagement C
```

Possible organization information includes:

- name
- logo reference
- country
- active/inactive state

V1 does **not** snapshot the historical name or logo of a client for every engagement.

Changes to current organization branding do not require maintaining a corporate identity archive.

---

## 8. ClientEngagement

A `ClientEngagement` represents actual work performed by BAKENEL for a `ClientOrganization`.

Examples include:

- professional training
- consulting
- study
- audit
- ISO certification support

Conceptual engagement types:

```text
TRAINING
CONSULTING
STUDY
AUDIT
ISO_SUPPORT
```

This list may evolve when genuine business requirements require additional types.

### 8.1 Engagement visibility

Historical existence and website visibility are separate concerns.

Conceptual visibility:

```text
PUBLIC
PRIVATE
```

A private engagement remains a valid business record but is not presented publicly.

This supports confidential client work.

Changing:

```text
PUBLIC → PRIVATE
```

does not rewrite history.

### 8.2 Engagement history

Once an engagement is completed, its essential historical business facts become read-only.

Examples include:

- client identity
- engagement type
- relevant date or period
- identity of the engagement

Website presentation may still change afterward.

For example, the system may allow:

- changing public/private visibility
- adding or changing presentation imagery
- adding a missing translation
- improving translated public copy

These presentation changes must not rewrite the underlying historical event.

---

## 9. Article

An `Article` represents editorial content for **"Actualités & Publications"**.

Articles are not historical transaction records.

Possible information includes:

- status
- cover image reference
- publication date
- update date
- translated title
- translated slug
- excerpt
- article content

### Lifecycle

Articles may be:

```text
DRAFT
PUBLISHED
ARCHIVED
```

Exact implementation terminology may be refined later.

Unlike completed sessions and engagements, published Articles remain normally editable.

V1 does not require full article version history.

Translations may become available independently.

A French article may therefore be published before English or Portuguese translations exist.

---

## 10. AdminUser

`AdminUser` represents an authenticated person authorized to manage the V1 BAKENEL administration interface.

V1 administrators are trusted administrators with full administrative access.

V1 does **not** introduce speculative role-based authorization such as:

```text
SUPER_ADMIN
EDITOR
TRAINER
MARKETING
STUDENT
```

unless a real business requirement emerges.

### 10.1 Identity separation

The following concepts are intentionally separate:

```text
AdminUser
Expert
Future Learner
```

An Expert is not automatically an AdminUser.

An AdminUser is not automatically an Expert.

A future learner identity must not be forced into the V1 `AdminUser` model.

---

## 11. Static Institutional Content

The following content does **not** require database-backed CMS management in V1:

- homepage institutional copy
- Qui sommes-nous ?
- Pourquoi nous choisir ?
- Mot du Directeur Général
- navigation labels
- footer copy
- generic CTA copy
- interface labels

This content changes rarely and remains application-managed.

Translations for this content belong in application/i18n resources.

If institutional content needs modification, it may be changed through application development rather than an admin CMS.

---

## 12. Media Boundary

Images and other uploaded media must not be stored as binary blobs directly in the PostgreSQL business tables.

Examples include:

- Expert portraits
- Article cover images
- ClientOrganization logos
- Training imagery

Business records may reference externally stored media using appropriate identifiers, keys, URLs, and metadata.

The specific media provider is an infrastructure decision and is intentionally not defined by this domain document.

V1 does not require a generic media-library domain unless an actual media-management requirement emerges.

---

## 13. Translation Model

BAKENEL supports:

```text
FR
EN
PT
```

Portuguese support is part of the architecture because BAKENEL intends to serve Portuguese-speaking markets including Angola.

Translations are presentation content attached to a business entity.

They are **not** independent copies of the business entity.

Conceptually:

```text
Training
└── TrainingTranslation

TrainingDomain
└── TrainingDomainTranslation

TrainingTopic
└── TrainingTopicTranslation

Expert
└── ExpertTranslation

ClientEngagement
└── ClientEngagementTranslation

Article
└── ArticleTranslation
```

A locale may be absent while other locales are available.

The application must not require all supported translations before publishing content in one locale.

---

## 14. Deletion and Archival Policy

BAKENEL uses three different concepts deliberately:

```text
DELETE
ARCHIVE / DEACTIVATE
PRESERVE
```

### DELETE

Appropriate primarily for disposable drafts that have no meaningful business history or dependencies.

### ARCHIVE / DEACTIVATE

Appropriate for established reusable concepts such as:

- Training
- TrainingDomain
- TrainingTopic
- Expert
- other established catalogue entities

Archiving removes something from current use without erasing its historical identity.

### PRESERVE

Required for historical business records such as:

- completed TrainingSession
- cancelled TrainingSession
- completed ClientEngagement

Historical records must not disappear because they are no longer current.

---

## 15. V2 — BAKENEL Learning Boundary

BAKENEL V1 is **not** a learning-management system.

The following concepts are intentionally outside V1:

```text
Learner
Enrollment
Order
Payment
Entitlement
DigitalCourse
CourseModule
Lesson
Video
Progress
Certificate
```

Do not introduce partial versions of these models into V1 without an approved domain change.

### 15.1 Future extension seam

A future digital-learning product may conceptually extend `Training` as follows:

```text
                       ┌── TrainingSession   [V1]
                       │
Training ──────────────┤
                       │
                       └── DigitalCourse     [V2]
                                │
                                └── CourseModule
                                        │
                                        └── Lesson
```

`TrainingSession` and `DigitalCourse` represent different delivery models.

They must not be collapsed into one generic entity merely because both deliver educational content.

The exact V2 model must undergo its own domain audit before implementation.

---

## 16. Domain Invariants

The following invariants are authoritative.

### INV-01 — Training vs Session

A `Training` represents reusable educational content.

A `TrainingSession` represents an actual scheduled delivery.

They are not interchangeable.

### INV-02 — Cancellation is preserved

A cancelled `TrainingSession` remains recorded as `CANCELLED`.

Cancellation does not cause deletion.

### INV-03 — Completed sessions are historical

The historical business facts of a completed `TrainingSession` are read-only.

### INV-04 — Multiple trainers

A `TrainingSession` may have one or multiple `Expert` records.

### INV-05 — Concurrent delivery

The same `Training` may have multiple concurrent `TrainingSession` records in different locations.

### INV-06 — Independent translations

FR, EN, and PT translations may become available independently.

Missing translations must not prevent publication of an available locale.

### INV-07 — Expert history

Experts with historical relationships are deactivated rather than erased.

### INV-08 — Client vs engagement

`ClientOrganization` and `ClientEngagement` are distinct business concepts.

One client may have multiple engagements.

### INV-09 — Completed engagement history

Essential historical facts of a completed `ClientEngagement` are read-only.

### INV-10 — Visibility is not existence

Whether a `ClientEngagement` is public or private is independent of whether that engagement historically exists.

### INV-11 — Editorial content remains editable

Published Articles may be edited.

V1 does not require full editorial version history.

### INV-12 — Capacity is not availability

A `TrainingSession` capacity does not imply that BAKENEL knows the authoritative number of remaining seats.

### INV-13 — Identity boundaries

`AdminUser`, `Expert`, and future Learner identities are separate domain concepts.

### INV-14 — Institutional content is static

Rarely changing institutional website content does not belong in the V1 database.

### INV-15 — Preserve according to meaning

Delete drafts.

Archive established business concepts.

Preserve historical records.

---

## 17. Implementation Rule

This document defines business meaning.

The Prisma schema is an implementation of this model, not the source from which this model is inferred.

If implementation convenience conflicts with a domain invariant, **the domain invariant wins**.

Before every substantial BAKENEL domain ticket, explicitly answer:

> **What historical information must this change preserve?**

Any ticket requiring a change to these invariants must first update and review this domain document.
