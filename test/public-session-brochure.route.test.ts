import { TrainingSessionBrochureState } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), getPrivateObject: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { trainingSession: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/admin/session-brochure.server", () => ({
  brochureStorage: () => ({ getPrivateObject: mocks.getPrivateObject }),
}));

import { GET } from "../app/api/public/[locale]/formations/[slug]/sessions/[sessionId]/brochure/route";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
function request(overrides: Partial<{ locale: string; slug: string; sessionId: string }> = {}) {
  return GET(new Request("https://public.test"), {
    params: Promise.resolve({ locale: "fr", slug: "gestion-risques", sessionId, ...overrides }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findFirst.mockResolvedValue({
    brochures: [{ storageKey: "private/key", originalFilename: 'guide/"2027".pdf' }],
  });
  mocks.getPrivateObject.mockResolvedValue({ stream: new Blob(["%PDF-1.4\n%%EOF"]).stream() });
});

describe("public session brochure download route", () => {
  it("rejects malformed public identities before querying storage", async () => {
    const response = await request({ locale: "de" });
    expect(response.status).toBe(404);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.getPrivateObject).not.toHaveBeenCalled();
  });

  it("requeries the eligible session, its requested-locale programme slug, and only ACTIVE brochures", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: sessionId,
          training: expect.objectContaining({
            is: expect.objectContaining({
              translations: {
                some: expect.objectContaining({ slug: "gestion-risques", isPublished: true }),
              },
            }),
          }),
        }),
      }),
    );
    expect(mocks.findFirst.mock.calls[0][0].select.brochures.where.state).toBe(
      TrainingSessionBrochureState.ACTIVE,
    );
  });

  it("streams the current active brochure as a sanitized no-store attachment without leaking its key", async () => {
    const response = await request();
    const body = await response.text();
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="guide__2027_.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toContain("%PDF-1.4");
    expect(JSON.stringify([...response.headers])).not.toContain("private/key");
  });

  it("returns 404 when eligibility, the requested programme association, or an ACTIVE brochure is absent", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ brochures: [] });
    expect((await request()).status).toBe(404);
    expect((await request()).status).toBe(404);
    expect(mocks.getPrivateObject).not.toHaveBeenCalled();
  });

  it("returns a sanitized 503 rather than a redirect or provider error when private storage fails", async () => {
    mocks.getPrivateObject.mockRejectedValue(new Error("provider token private/key failed"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private/key");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("location")).toBeNull();
  });
});
