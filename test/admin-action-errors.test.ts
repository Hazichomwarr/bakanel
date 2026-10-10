import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  createTrainingDomain: vi.fn(),
  upsertTrainingDomainTranslation: vi.fn(),
}));

vi.mock("@/lib/auth/current-admin", () => ({
  requireAdmin: async () => ({ id: "admin", email: "admin@example.com", name: "Awa" }),
}));
vi.mock("@/lib/catalogue.service", () => ({ catalogueService: services }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: path });
  },
}));

import {
  adminActionErrorDiagnostic,
  UNEXPECTED_ADMIN_ACTION_MESSAGE,
} from "../lib/admin/action-errors";
import { createDomainAction } from "../lib/admin/catalogue.actions";
import { CatalogueDomainError } from "../lib/catalogue.errors";

const CONNECTION_STRING = "postgresql://owner:top-secret-password@db.internal:5432/bakanel";
const SESSION_TOKEN = "bakanel_session=Q2xhdWRlU2Vzc2lvblRva2VuVmFsdWVGb3JUZXN0aW5nMTIz";
const PRIVATE_FORM_VALUE = "it-private-submitted-domain-name";
const SENSITIVE_VALUES = [
  "top-secret-password",
  "db.internal",
  "postgresql://",
  "Q2xhdWRlU2Vzc2lvblRva2VuVmFsdWVGb3JUZXN0aW5nMTIz",
  PRIVATE_FORM_VALUE,
];

function domainForm() {
  const data = new FormData();
  data.set("locale", "FR");
  data.set("name", PRIVATE_FORM_VALUE);
  data.set("slug", "it-private-slug");
  return data;
}

function connectionFailure() {
  return new Prisma.PrismaClientKnownRequestError(
    `Can't reach database server at ${CONNECTION_STRING} (cookie ${SESSION_TOKEN})`,
    { code: "P1001", clientVersion: "test" },
  );
}

let consoleError: { mock: { calls: unknown[][] }; mockRestore: () => void };

function loggedOutput() {
  return consoleError.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
}

beforeEach(() => {
  services.createTrainingDomain.mockReset();
  services.upsertTrainingDomainTranslation.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("admin action diagnostic", () => {
  it("keeps only the allowlisted fields of a Prisma failure", () => {
    expect(adminActionErrorDiagnostic("catalogue", connectionFailure())).toEqual({
      event: "admin_action_unexpected_error",
      area: "catalogue",
      errorName: "PrismaClientKnownRequestError",
      prismaCode: "P1001",
    });
  });

  it("omits the message, stack, and cause of a programming error", () => {
    const error = new TypeError(`Cannot read ${CONNECTION_STRING}`, {
      cause: new Error(SESSION_TOKEN),
    });

    const diagnostic = adminActionErrorDiagnostic("sessions", error);

    expect(diagnostic).toEqual({
      event: "admin_action_unexpected_error",
      area: "sessions",
      errorName: "TypeError",
    });
  });

  it("ignores a non-Prisma code value", () => {
    const error = Object.assign(new Error("failure"), { code: CONNECTION_STRING });

    expect(adminActionErrorDiagnostic("clients", error)).not.toHaveProperty("prismaCode");
  });

  it("describes a thrown non-error value by its type only", () => {
    expect(adminActionErrorDiagnostic("articles", CONNECTION_STRING)).toEqual({
      event: "admin_action_unexpected_error",
      area: "articles",
      errorName: "string",
    });
  });
});

describe("admin action unexpected-error logging", () => {
  it("records one structured diagnostic and returns the generic message", async () => {
    services.createTrainingDomain.mockRejectedValue(connectionFailure());

    await expect(createDomainAction({}, domainForm())).resolves.toEqual({
      error: UNEXPECTED_ADMIN_ACTION_MESSAGE,
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(consoleError.mock.calls[0][0]))).toEqual({
      event: "admin_action_unexpected_error",
      area: "catalogue",
      errorName: "PrismaClientKnownRequestError",
      prismaCode: "P1001",
    });
  });

  it("never logs credentials, tokens, connection strings, or submitted form data", async () => {
    services.createTrainingDomain.mockRejectedValue(connectionFailure());

    await createDomainAction({}, domainForm());

    for (const value of SENSITIVE_VALUES) {
      expect(loggedOutput()).not.toContain(value);
    }
  });

  it("does not log expected domain errors", async () => {
    services.createTrainingDomain.mockRejectedValue(
      new CatalogueDomainError("SLUG_CONFLICT", "Domain slug already exists for this locale."),
    );

    const result = await createDomainAction({}, domainForm());

    expect(result.error).not.toBe(UNEXPECTED_ADMIN_ACTION_MESSAGE);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not log the redirect that completes a successful action", async () => {
    services.createTrainingDomain.mockResolvedValue({ id: "domain-1" });
    services.upsertTrainingDomainTranslation.mockResolvedValue({});

    await expect(createDomainAction({}, domainForm())).rejects.toMatchObject({
      redirectTo: "/admin/formations/domaines/domain-1",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
