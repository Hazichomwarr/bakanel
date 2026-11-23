import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the installed `@vercel/blob` presigning code (not a mock) to prove the payload
 * returned to the browser carries no provider callback and no deployment-protection bypass.
 * Only network-bound token issuance and the database-backed authorization are replaced.
 */

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  validateAuthorization: vi.fn(),
  issueSignedToken: vi.fn(),
}));

vi.mock("@/lib/auth/current-admin", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("@/lib/training-session-brochure-authorization.service", () => ({
  brochureUploadAuthorizationService: { validate: mocks.validateAuthorization },
}));
vi.mock("@/lib/session-brochure-storage", () => ({
  resolveVercelPrivateBlobConfiguration: () => ({
    environment: "preview",
    storeId: "store_preview_123",
    webhookPublicKey: "preview-webhook-public-key",
  }),
  resolveRuntimeOidcToken: async () => "runtime-oidc-token",
}));
vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  issueSignedToken: mocks.issueSignedToken,
}));

import { POST as uploadRoute } from "../app/admin/api/session-brochures/upload/route";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
const pendingBrochureId = "123e4567-e89b-12d3-a456-426614174001";
const secret = "c".repeat(64);
const storageKey = `preview/session-brochures/${sessionId}/file.pdf`;
const bypassSecret = "protection-bypass-secret-value";

function delegationToken(validUntil: number) {
  const scope = {
    pathname: storageKey,
    operations: ["put"],
    allowedContentTypes: ["application/pdf"],
    maximumSizeInBytes: 10 * 1024 * 1024,
    validUntil,
  };

  return Buffer.from(JSON.stringify(scope)).toString("base64url") + ".signature";
}

beforeEach(() => {
  vi.resetAllMocks();
  // Each of these would make the SDK resolve a callback URL if a completion handler existed.
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_BRANCH_URL", "bakanel-git-preview.vercel.app");
  vi.stubEnv("VERCEL_BLOB_CALLBACK_URL", "https://callback.example.test");
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", bypassSecret);

  const expiresAt = new Date(Date.now() + 300_000);
  mocks.admin.mockResolvedValue({ id: "123e4567-e89b-12d3-a456-426614174010" });
  mocks.validateAuthorization.mockResolvedValue({ pendingBrochure: { storageKey }, expiresAt });
  mocks.issueSignedToken.mockResolvedValue({
    clientSigningToken: "client-signing-token",
    delegationToken: delegationToken(expiresAt.getTime()),
    validUntil: expiresAt.getTime(),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("presigned brochure upload payload", () => {
  it("contains no callback URL, callback payload, bypass secret, or authorization secret", async () => {
    const response = await uploadRoute(
      new Request("https://example.test/admin/api/session-brochures/upload", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.generate-presigned-url",
          payload: {
            pathname: storageKey,
            clientPayload: JSON.stringify({ sessionId, pendingBrochureId, secret }),
            multipart: false,
          },
        }),
      }),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.type).toBe("blob.generate-presigned-url");
    expect(Object.keys(body.presignedUrlPayload.params)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("callback")]),
    );
    expect(serialized).not.toContain("callback");
    expect(serialized).not.toContain("bakanel-git-preview.vercel.app");
    expect(serialized).not.toContain(bypassSecret);
    expect(serialized).not.toContain("x-vercel-protection-bypass");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("runtime-oidc-token");
  });
});
