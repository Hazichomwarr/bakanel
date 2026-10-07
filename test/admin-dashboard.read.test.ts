/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleStatus, CatalogueStatus, EngagementStatus, EngagementVisibility, ExpertStatus, SessionStatus, type PrismaClient } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createAdminDashboardReader } from "../lib/admin/dashboard.read";

function clientWithCapture() {
  const training = { count: vi.fn().mockResolvedValue(2) };
  const trainingSession = { count: vi.fn().mockResolvedValue(3), findMany: vi.fn().mockResolvedValue([{ id: "session", startDate: new Date("2026-10-09T00:00:00.000Z"), city: "Ouagadougou", deliveryMode: "IN_PERSON", status: SessionStatus.OPEN, pricingMode: "FIXED", price: { toString: () => "250000" }, currency: "XOF", training: { translations: [] } }]) };
  const expert = { count: vi.fn().mockResolvedValue(4) };
  const clientEngagement = { count: vi.fn().mockResolvedValue(5) };
  const article = { count: vi.fn().mockResolvedValue(6) };
  return { client: { training, trainingSession, expert, clientEngagement, article } as unknown as PrismaClient, training, trainingSession, expert, clientEngagement, article };
}

describe("admin dashboard reader", () => {
  it("uses explicit operational predicates and a bounded French projection", async () => {
    const captured = clientWithCapture();
    const dashboard = await createAdminDashboardReader(captured.client, () => new Date("2026-10-06T17:30:00.000Z")).read();
    expect(captured.training.count).toHaveBeenCalledWith({ where: { status: CatalogueStatus.PUBLISHED } });
    expect(captured.expert.count).toHaveBeenCalledWith({ where: { status: ExpertStatus.ACTIVE } });
    expect(captured.clientEngagement.count).toHaveBeenCalledWith({ where: { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC } });
    expect(captured.article.count).toHaveBeenCalledWith({ where: { status: ArticleStatus.PUBLISHED } });
    expect(captured.trainingSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, orderBy: { startDate: "asc" }, where: { startDate: { gte: new Date("2026-10-06T00:00:00.000Z") }, status: { in: [SessionStatus.OPEN, SessionStatus.CLOSED] } } }));
    expect(dashboard.upcomingSessions[0]?.title).toBe("Formation sans titre français");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Behavioural proof: the reader's real predicates are evaluated against a fixture dataset. The evaluator supports
// only equality, `in` and `gte`, and throws on anything else (e.g. a relation filter such as
// `clientOrganization: { isActive: true }`), so an added join cannot pass silently.

type Row = Record<string, unknown>;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function evaluate(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      const keys = Object.keys(condition);
      if (keys.length === 1 && keys[0] === "in") return (condition as { in: unknown[] }).in.includes(value);
      if (keys.length === 1 && keys[0] === "gte") return (value as Date).getTime() >= (condition as { gte: Date }).gte.getTime();
      throw new Error(`Unsupported dashboard predicate on ${field}: ${JSON.stringify(condition)}`);
    }
    return value === condition;
  });
}

function fixtureClient(data: { trainings?: Row[]; sessions?: Row[]; experts?: Row[]; engagements?: Row[]; articles?: Row[] }) {
  const counter = (rows: Row[] = []) => ({ count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => evaluate(row, where)).length });
  const trainings = data.trainings ?? [];
  return {
    training: counter(trainings),
    expert: counter(data.experts),
    clientEngagement: counter(data.engagements),
    article: counter(data.articles),
    trainingSession: {
      ...counter(data.sessions),
      findMany: async ({ where, orderBy, take, select }: any) => {
        expect(orderBy).toEqual({ startDate: "asc" });
        const locale = select.training.select.translations.where.locale;
        return (data.sessions ?? [])
          .filter((row) => evaluate(row, where))
          .sort((a, b) => (a.startDate as Date).getTime() - (b.startDate as Date).getTime())
          .slice(0, take)
          .map((row) => {
            const training = trainings.find((candidate) => candidate.id === row.trainingId) ?? { translations: [] };
            const translations = (training.translations as Row[]).filter((translation) => translation.locale === locale).slice(0, select.training.select.translations.take);
            return { ...row, price: row.price === null ? null : { toString: () => String(row.price) }, training: { translations: translations.map(({ title }) => ({ title })) } };
          });
      },
    },
  } as unknown as PrismaClient;
}

const session = (id: string, startDate: string, status: SessionStatus, extra: Row = {}): Row => ({ id, trainingId: "t-fr", startDate: day(startDate), status, city: "Ouagadougou", deliveryMode: "IN_PERSON", pricingMode: "FIXED", price: "250000", currency: "XOF", ...extra });
const readAt = (client: PrismaClient, now: string) => createAdminDashboardReader(client, () => new Date(now)).read();

describe("admin dashboard metrics (behavioural)", () => {
  it("counts only PUBLISHED trainings, ACTIVE experts, and PUBLISHED articles; drafts go to attention", async () => {
    const dashboard = await readAt(fixtureClient({
      trainings: [{ status: CatalogueStatus.PUBLISHED }, { status: CatalogueStatus.PUBLISHED }, { status: CatalogueStatus.DRAFT }, { status: CatalogueStatus.ARCHIVED }],
      experts: [{ status: ExpertStatus.ACTIVE }, { status: ExpertStatus.INACTIVE }],
      // A published article with no translation at all still counts: aggregates are not locale-dependent.
      articles: [{ status: ArticleStatus.PUBLISHED, translations: [] }, { status: ArticleStatus.DRAFT }, { status: ArticleStatus.DRAFT }, { status: ArticleStatus.ARCHIVED }],
    }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.metrics).toMatchObject({ publishedTrainings: 2, activeExperts: 1, publishedArticles: 1 });
    expect(dashboard.attention).toMatchObject({ draftTrainings: 1, draftArticles: 2 });
  });

  it("counts COMPLETED + PUBLIC engagements even when their ClientOrganization is inactive", async () => {
    const dashboard = await readAt(fixtureClient({
      engagements: [
        { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC, clientOrganization: { isActive: false } },
        { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PUBLIC, clientOrganization: { isActive: true } },
        { status: EngagementStatus.COMPLETED, visibility: EngagementVisibility.PRIVATE, clientOrganization: { isActive: true } },
        { status: EngagementStatus.DRAFT, visibility: EngagementVisibility.PUBLIC, clientOrganization: { isActive: true } },
      ],
    }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.metrics.publicEngagements).toBe(2);
  });
});

describe("admin dashboard upcoming sessions (behavioural)", () => {
  const trainings = [{ id: "t-fr", translations: [{ locale: "FR", title: "Management de la qualité" }, { locale: "EN", title: "Quality management" }] }];

  it("includes OPEN/CLOSED sessions from today on and excludes DRAFT, CANCELLED, COMPLETED, and past sessions", async () => {
    const dashboard = await readAt(fixtureClient({
      trainings,
      sessions: [
        session("open-today", "2026-10-06", SessionStatus.OPEN),
        session("closed-tomorrow", "2026-10-07", SessionStatus.CLOSED),
        session("open-past", "2026-10-05", SessionStatus.OPEN),
        session("closed-past", "2026-09-30", SessionStatus.CLOSED),
        session("draft-future", "2026-10-08", SessionStatus.DRAFT),
        session("cancelled-future", "2026-10-08", SessionStatus.CANCELLED),
        session("completed-future", "2026-10-08", SessionStatus.COMPLETED),
      ],
    }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.upcomingSessions.map((item) => item.id)).toEqual(["open-today", "closed-tomorrow"]);
    expect(dashboard.metrics.upcomingSessions).toBe(2);
    expect(dashboard.attention.draftSessions).toBe(1);
  });

  it("orders nearest first and bounds the list to 5 while the metric counts every upcoming session", async () => {
    const dates = ["2026-12-01", "2026-10-09", "2026-11-15", "2026-10-07", "2027-01-10", "2026-10-20", "2026-10-06"];
    const dashboard = await readAt(fixtureClient({ trainings, sessions: dates.map((date) => session(date, date, SessionStatus.OPEN)) }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.upcomingSessions.map((item) => item.id)).toEqual(["2026-10-06", "2026-10-07", "2026-10-09", "2026-10-20", "2026-11-15"]);
    expect(dashboard.metrics.upcomingSessions).toBe(7);
  });

  it("treats today as upcoming until the last UTC (Ouagadougou) instant, and as past from the next midnight", async () => {
    const client = fixtureClient({ trainings, sessions: [session("today", "2026-10-06", SessionStatus.OPEN)] });
    expect((await readAt(client, "2026-10-06T00:00:00.000Z")).upcomingSessions).toHaveLength(1);
    expect((await readAt(client, "2026-10-06T23:59:59.999Z")).upcomingSessions).toHaveLength(1);
    expect((await readAt(client, "2026-10-07T00:00:00.000Z")).upcomingSessions).toHaveLength(0);
  });

  it("projects the French title, or the explicit French fallback, never an EN/PT substitute", async () => {
    const dashboard = await readAt(fixtureClient({
      trainings: [...trainings, { id: "t-en-pt", translations: [{ locale: "EN", title: "English only" }, { locale: "PT", title: "Só português" }] }],
      sessions: [session("fr", "2026-10-07", SessionStatus.OPEN), session("no-fr", "2026-10-08", SessionStatus.OPEN, { trainingId: "t-en-pt" })],
    }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.upcomingSessions.map((item) => item.title)).toEqual(["Management de la qualité", "Formation sans titre français"]);
  });

  it("presents ONLINE sessions as remote without a physical location, and IN_PERSON by city", async () => {
    const dashboard = await readAt(fixtureClient({
      trainings,
      sessions: [
        session("in-person", "2026-10-07", SessionStatus.OPEN, { city: "Bobo-Dioulasso" }),
        session("online", "2026-10-08", SessionStatus.OPEN, { deliveryMode: "ONLINE", city: null }),
        session("online-with-stale-city", "2026-10-09", SessionStatus.OPEN, { deliveryMode: "ONLINE", city: "Ouagadougou" }),
      ],
    }), "2026-10-06T10:00:00.000Z");
    expect(dashboard.upcomingSessions.map((item) => item.location)).toEqual(["Bobo-Dioulasso", "En ligne", "En ligne"]);
  });
});

describe("admin dashboard calendar dates across server timezones", () => {
  const originalTimezone = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTimezone; });

  it.each([
    ["America/Los_Angeles (UTC−7): local date is still 5 Oct", "America/Los_Angeles", "2026-10-06T02:00:00.000Z"],
    ["Pacific/Kiritimati (UTC+14): local date is already 7 Oct", "Pacific/Kiritimati", "2026-10-06T22:00:00.000Z"],
  ])("uses the Ouagadougou calendar day under %s", async (_label, timezone, now) => {
    process.env.TZ = timezone;
    const trainings = [{ id: "t-fr", translations: [{ locale: "FR", title: "Audit" }] }];
    const dashboard = await readAt(fixtureClient({
      trainings,
      sessions: [session("5 Oct", "2026-10-05", SessionStatus.OPEN), session("6 Oct", "2026-10-06", SessionStatus.OPEN), session("7 Oct", "2026-10-07", SessionStatus.OPEN)],
    }), now);
    expect(dashboard.upcomingSessions.map((item) => item.id)).toEqual(["6 Oct", "7 Oct"]);
    expect(dashboard.upcomingSessions[0].startDate).toEqual(day("2026-10-06"));
  });
});
