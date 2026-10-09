import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicSessionReader } from "@/lib/public/session.read";

import {
  createDomain,
  createPublishedTraining,
  createTopic,
  createTraining,
  resetPublicContent,
} from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

// Late in the UTC day: date-only comparisons must still treat 2026-10-08 as "today".
const now = new Date("2026-10-08T23:30:00.000Z");

let client: PrismaClient;
let reader: ReturnType<typeof createPublicSessionReader>;

function calendarDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

type SessionFixture = {
  status?: "DRAFT" | "OPEN" | "CLOSED" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate?: string;
  registrationDeadline?: string | null;
  pricingMode?: "FIXED" | "ON_REQUEST";
  price?: string | null;
  city?: string;
};

function createSession(trainingId: string, input: SessionFixture) {
  return client.trainingSession.create({
    data: {
      trainingId,
      status: input.status ?? "OPEN",
      startDate: calendarDate(input.startDate),
      endDate: calendarDate(input.endDate ?? input.startDate),
      registrationDeadline: input.registrationDeadline
        ? calendarDate(input.registrationDeadline)
        : null,
      deliveryMode: "IN_PERSON",
      country: "BF",
      city: input.city ?? "it-Ouagadougou",
      venue: "it-venue",
      pricingMode: input.pricingMode ?? "ON_REQUEST",
      price: input.price ?? null,
      currency: input.price ? "XOF" : null,
      capacity: 25,
    },
  });
}

beforeAll(() => {
  client = createTestPrismaClient();
  reader = createPublicSessionReader(client, () => now);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe("public session readers against PostgreSQL", () => {
  it("lists upcoming OPEN and CLOSED sessions with registration derived from UTC calendar days", async () => {
    const training = await createPublishedTraining(client, "sessions");
    await createSession(training.id, {
      startDate: "2026-10-20",
      registrationDeadline: "2026-10-15",
      city: "it-open",
    });
    await createSession(training.id, {
      status: "CLOSED",
      startDate: "2026-10-21",
      city: "it-closed",
    });
    await createSession(training.id, {
      startDate: "2026-10-22",
      registrationDeadline: "2026-10-01",
      city: "it-expired-deadline",
    });
    await createSession(training.id, {
      startDate: "2026-10-23",
      registrationDeadline: "2026-10-08",
      city: "it-deadline-today",
    });
    await createSession(training.id, { startDate: "2026-10-08", city: "it-starts-today" });

    const sessions = await reader.listPublicUpcomingSessions("fr");

    expect(sessions.map((session) => [session.city, session.registrationOpen])).toEqual([
      ["it-starts-today", true],
      ["it-open", true],
      ["it-closed", false],
      ["it-expired-deadline", false],
      ["it-deadline-today", true],
    ]);
    expect(sessions[0].startDate).toEqual(calendarDate("2026-10-08"));
    expect(sessions[4].registrationDeadline).toEqual(calendarDate("2026-10-08"));
  });

  it("excludes past sessions and DRAFT, CANCELLED, and COMPLETED sessions", async () => {
    const training = await createPublishedTraining(client, "terminal");
    await createSession(training.id, { startDate: "2026-10-07", city: "it-past" });
    await createSession(training.id, { status: "DRAFT", startDate: "2026-11-01" });
    await createSession(training.id, { status: "CANCELLED", startDate: "2026-11-01" });
    await createSession(training.id, { status: "COMPLETED", startDate: "2026-11-01" });

    await expect(reader.listPublicUpcomingSessions("fr")).resolves.toEqual([]);
    await expect(client.trainingSession.count()).resolves.toBe(4);
  });

  it("hides sessions whose training ancestry is unpublished", async () => {
    const draftDomain = await createDomain(client, {
      status: "DRAFT",
      translations: [{ locale: "FR", slug: "draft-domain" }],
    });
    const topic = await createTopic(client, {
      trainingDomainId: draftDomain.id,
      translations: [{ locale: "FR", slug: "topic" }],
    });
    const training = await createTraining(client, {
      trainingTopicId: topic.id,
      translations: [{ locale: "FR", slug: "hidden-training" }],
    });
    await createSession(training.id, { startDate: "2026-11-01" });

    await expect(reader.listPublicUpcomingSessions("fr")).resolves.toEqual([]);
    await expect(
      reader.listPublicUpcomingSessionsForTraining("fr", "it-hidden-training"),
    ).resolves.toEqual([]);
  });

  it("finds training sessions only through the requested locale's published slug", async () => {
    const training = await createPublishedTraining(client, "bilingual", ["FR", "EN"]);
    const otherTraining = await createPublishedTraining(client, "other", ["FR"]);
    await createSession(training.id, { startDate: "2026-11-01", city: "it-wanted" });
    await createSession(otherTraining.id, { startDate: "2026-11-02", city: "it-unrelated" });

    const french = await reader.listPublicUpcomingSessionsForTraining("fr", "it-bilingual-fr");

    expect(french.map((session) => [session.city, session.trainingSlug])).toEqual([
      ["it-wanted", "it-bilingual-fr"],
    ]);
    await expect(
      reader.listPublicUpcomingSessionsForTraining("fr", "it-bilingual-en"),
    ).resolves.toEqual([]);
    await expect(
      reader.listPublicUpcomingSessionsForTraining("en", "it-bilingual-en"),
    ).resolves.toEqual([expect.objectContaining({ trainingSlug: "it-bilingual-en" })]);
  });

  it("serializes fixed Decimal prices and never exposes an ON_REQUEST amount", async () => {
    const training = await createPublishedTraining(client, "pricing");
    await createSession(training.id, {
      startDate: "2026-11-01",
      pricingMode: "FIXED",
      price: "150000.50",
      city: "it-fixed",
    });
    await createSession(training.id, {
      startDate: "2026-11-02",
      pricingMode: "FIXED",
      price: "150000.00",
      city: "it-fixed-whole",
    });
    await createSession(training.id, {
      startDate: "2026-11-03",
      pricingMode: "ON_REQUEST",
      price: "99999.00",
      city: "it-on-request",
    });

    const sessions = await reader.listPublicUpcomingSessions("fr");

    expect(sessions.map((session) => [session.city, session.price])).toEqual([
      ["it-fixed", "150000.5"],
      ["it-fixed-whole", "150000"],
      ["it-on-request", null],
    ]);
  });

  it("returns only the documented session DTO fields", async () => {
    const training = await createPublishedTraining(client, "projection");
    await createSession(training.id, { startDate: "2026-11-01" });

    const [session] = await reader.listPublicUpcomingSessions("fr");

    expect(Object.keys(session).sort()).toEqual(
      [
        "city",
        "country",
        "currency",
        "deliveryMode",
        "endDate",
        "price",
        "pricingMode",
        "registrationDeadline",
        "registrationOpen",
        "startDate",
        "trainingSlug",
        "trainingTitle",
        "venue",
      ].sort(),
    );
  });
});
