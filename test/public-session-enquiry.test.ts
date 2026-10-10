import { DeliveryMode, PricingMode, SessionStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicTrainingBySlug = vi.hoisted(() => vi.fn());
const listPublicTrainingAlternates = vi.hoisted(() => vi.fn());
const listPublicUpcomingSessionsForTraining = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public/training.read", () => ({
  publicTrainingReader: { getPublicTrainingBySlug, listPublicTrainingAlternates },
}));

vi.mock("@/lib/public/session.read", () => ({
  publicSessionReader: { listPublicUpcomingSessionsForTraining },
}));

import TrainingDetailPage from "../app/(public)/[locale]/formations/[slug]/page";
import { WHATSAPP_CONTACT_URL } from "../lib/public/contact";
import { dictionaries } from "../lib/public/content";
import type { PublicSessionDto } from "../lib/public/dto";
import { isRegistrationOpen } from "../lib/public/eligibility";
import { publicLocales, type PublicLocale } from "../lib/public/locale";

const training = {
  slug: "gestion-des-sinistres",
  title: "Gestion des sinistres",
  summary: null,
  description: null,
  objectives: null,
  targetAudience: null,
  program: null,
  domain: { name: "Assurance", slug: "assurance" },
  topic: { name: "Sinistres", slug: "sinistres" },
};

function session(overrides: Partial<PublicSessionDto>): PublicSessionDto {
  return {
    trainingSlug: training.slug,
    trainingTitle: training.title,
    startDate: new Date("2026-11-12T00:00:00.000Z"),
    endDate: new Date("2026-11-14T00:00:00.000Z"),
    deliveryMode: DeliveryMode.IN_PERSON,
    city: "Ouagadougou",
    country: "BF",
    venue: "Centre de formation",
    pricingMode: PricingMode.FIXED,
    price: "150000",
    currency: "XOF",
    registrationDeadline: new Date("2026-11-02T00:00:00.000Z"),
    registrationOpen: true,
    ...overrides,
  };
}

const enquiriesOpen = session({});
const enquiriesClosed = session({
  startDate: new Date("2026-12-07T00:00:00.000Z"),
  endDate: new Date("2026-12-09T00:00:00.000Z"),
  registrationOpen: false,
});

async function renderDetail(locale: PublicLocale, sessions: PublicSessionDto[]) {
  listPublicUpcomingSessionsForTraining.mockResolvedValue(sessions);
  const page = await TrainingDetailPage({
    params: Promise.resolve({ locale, slug: training.slug }),
  });

  return renderToStaticMarkup(page).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

function occurrences(markup: string, text: string) {
  return markup.split(text).length - 1;
}

/** The general contact block, which must exist at most once per page. */
function futureSessionsBlock(markup: string) {
  return markup.match(/<section aria-labelledby="future-sessions-title"[\s\S]*?<\/section>/g) ?? [];
}

beforeEach(() => {
  getPublicTrainingBySlug.mockReset();
  listPublicTrainingAlternates.mockReset();
  listPublicUpcomingSessionsForTraining.mockReset();
  getPublicTrainingBySlug.mockResolvedValue(training);
  listPublicTrainingAlternates.mockResolvedValue([]);
});

describe("enquiry eligibility source of truth (UTC calendar days)", () => {
  const today = new Date("2026-10-10T22:30:00.000Z");
  const upcomingStart = new Date("2026-11-12");

  it.each([
    ["OPEN without a deadline", SessionStatus.OPEN, null, true],
    ["OPEN with a future deadline", SessionStatus.OPEN, "2026-10-11", true],
    ["OPEN with a deadline equal to today", SessionStatus.OPEN, "2026-10-10", true],
    ["OPEN with an expired deadline", SessionStatus.OPEN, "2026-10-09", false],
    ["CLOSED without a deadline", SessionStatus.CLOSED, null, false],
    ["CLOSED with a future deadline", SessionStatus.CLOSED, "2026-11-01", false],
  ] as const)("%s → enquiries %s", (_label, status, deadline, expected) => {
    const registrationDeadline = deadline === null ? null : new Date(deadline);

    expect(
      isRegistrationOpen({ status, startDate: upcomingStart, registrationDeadline }, today),
    ).toBe(expected);
  });
});

describe("session-specific enquiry CTA", () => {
  it("keeps the session-specific CTA on an OPEN session that still takes enquiries", async () => {
    const markup = await renderDetail("fr", [enquiriesOpen]);
    const detail = dictionaries.fr.trainingDetail;

    expect(occurrences(markup, `aria-label="${detail.sessionEnquiryLabel}:`)).toBe(1);
    expect(markup).toContain(detail.registrationOpen);
    expect(futureSessionsBlock(markup)).toHaveLength(0);
  });

  it("removes the session-specific CTA from a closed or deadline-expired session", async () => {
    const markup = await renderDetail("fr", [enquiriesClosed]);
    const detail = dictionaries.fr.trainingDetail;

    expect(markup).toContain(detail.registrationClosed);
    expect(markup).not.toContain(detail.sessionEnquiryLabel);
    expect(futureSessionsBlock(markup)).toHaveLength(1);
  });

  it("keeps the closed session's facts visible", async () => {
    const markup = await renderDetail("fr", [enquiriesClosed]);

    expect(markup).toContain("Ouagadougou");
    expect(markup).toMatch(/150[\s ]?000 CFA/);
    expect(markup).toContain("décembre 2026");
  });
});

describe("general future-sessions contact", () => {
  it("renders one general block for several closed sessions", async () => {
    const secondClosed = session({
      startDate: new Date("2027-01-11T00:00:00.000Z"),
      endDate: new Date("2027-01-12T00:00:00.000Z"),
      registrationDeadline: null,
      registrationOpen: false,
    });

    const markup = await renderDetail("fr", [enquiriesClosed, secondClosed]);

    expect(futureSessionsBlock(markup)).toHaveLength(1);
    expect(occurrences(markup, dictionaries.fr.trainingDetail.futureSessionsCta)).toBe(1);
  });

  it("separates open and closed sessions on a mixed page", async () => {
    const markup = await renderDetail("fr", [enquiriesOpen, enquiriesClosed]);
    const detail = dictionaries.fr.trainingDetail;

    expect(occurrences(markup, `aria-label="${detail.sessionEnquiryLabel}:`)).toBe(1);
    expect(markup).toContain(`${detail.sessionEnquiryLabel}: 12 novembre 2026`);
    expect(markup).not.toContain(`${detail.sessionEnquiryLabel}: 7 décembre 2026`);
    expect(futureSessionsBlock(markup)).toHaveLength(1);
  });

  it("links to the plain verified WhatsApp contact without a session-specific message", async () => {
    const [block] = futureSessionsBlock(await renderDetail("fr", [enquiriesClosed]));

    expect(block).toContain(`href="${WHATSAPP_CONTACT_URL}"`);
    expect(block).not.toMatch(/href="[^"]*[?&]text=/);
    expect(block).not.toMatch(/2026|Ouagadougou|aria-label=/);
  });

  it("adds no general block when no upcoming session is listed", async () => {
    const markup = await renderDetail("pt", []);

    expect(markup).toContain(dictionaries.pt.trainingDetail.sessionsEmpty);
    expect(futureSessionsBlock(markup)).toHaveLength(0);
  });

  it("renders a closed session with missing optional fields without a session CTA", async () => {
    const sparse = session({
      city: null,
      country: null,
      venue: null,
      pricingMode: PricingMode.ON_REQUEST,
      price: null,
      currency: null,
      registrationDeadline: null,
      registrationOpen: false,
    });

    const markup = await renderDetail("en", [sparse]);
    const detail = dictionaries.en.trainingDetail;

    expect(markup).toContain(detail.locationPending);
    expect(markup).toContain(detail.onRequestLabel);
    expect(markup).not.toContain(detail.sessionEnquiryLabel);
    expect(futureSessionsBlock(markup)).toHaveLength(1);
  });
});

describe("localized future-sessions copy", () => {
  it.each(publicLocales)(
    "renders the %s general block and closed status consistently",
    async (locale) => {
      const detail = dictionaries[locale].trainingDetail;
      const [block] = futureSessionsBlock(
        await renderDetail(locale, [enquiriesOpen, enquiriesClosed]),
      );

      expect(block).toContain(detail.futureSessionsTitle);
      expect(block).toContain(detail.futureSessionsDescription);
      expect(block).toContain(detail.futureSessionsCta);
      expect(detail.futureSessionsCta).not.toBe(detail.sessionEnquiryLabel);
    },
  );

  it.each(publicLocales)(
    "never presents the %s general copy as a specific or open session",
    (locale) => {
      const detail = dictionaries[locale].trainingDetail;
      const generalCopy = [
        detail.futureSessionsTitle,
        detail.futureSessionsDescription,
        detail.futureSessionsCta,
      ];

      for (const text of generalCopy) {
        expect(text).not.toMatch(/cette session|this session|esta sessão/i);
        expect(text).not.toMatch(/ouverte?s?\b|\bopen\b|aberta|disponíve/i);
        expect(text).not.toMatch(/inscri|regist|enrol|matr/i);
      }
    },
  );
});
