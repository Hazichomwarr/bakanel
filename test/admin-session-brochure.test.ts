import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  detail: vi.fn(),
  prepare: vi.fn(),
  issue: vi.fn(),
  validateAuthorization: vi.fn(),
  isCompleted: vi.fn(),
  finalizeAuthorizedUpload: vi.fn(),
  handleUploadPresigned: vi.fn(),
  issueSignedToken: vi.fn(),
  storageConfiguration: vi.fn(),
  runtimeOidcToken: vi.fn(),
  active: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth/current-admin", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("@/lib/admin/sessions.read", () => ({ adminSessionsReader: { detail: mocks.detail } }));
vi.mock("@/lib/admin/session-brochure.server", () => ({
  brochureWorkflow: () => ({
    preparePendingUpload: mocks.prepare,
    finalizeAuthorizedUpload: mocks.finalizeAuthorizedUpload,
  }),
  usesFakeBrochureStorage: () => false,
}));
vi.mock("@/lib/training-session-brochure-authorization.service", () => ({
  brochureUploadAuthorizationService: {
    issue: mocks.issue,
    validate: mocks.validateAuthorization,
    isCompleted: mocks.isCompleted,
  },
}));
vi.mock("@/lib/session-brochure-storage", () => ({
  resolveVercelPrivateBlobConfiguration: mocks.storageConfiguration,
  resolveRuntimeOidcToken: mocks.runtimeOidcToken,
}));
vi.mock("@vercel/blob/client", () => ({ handleUploadPresigned: mocks.handleUploadPresigned }));
vi.mock("@vercel/blob", () => ({ issueSignedToken: mocks.issueSignedToken }));
vi.mock("@/lib/training-session-brochure.service", () => ({
  trainingSessionBrochureService: {
    getActiveBrochure: mocks.active,
    removeActiveBrochure: mocks.remove,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { DELETE, GET, POST } from "../app/admin/api/session-brochures/[sessionId]/route";
import { POST as finalizeUpload } from "../app/admin/api/session-brochures/[sessionId]/finalize/route";
import { POST as uploadRoute } from "../app/admin/api/session-brochures/upload/route";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
const brochureId = "123e4567-e89b-12d3-a456-426614174001";
const context = { params: Promise.resolve({ sessionId }) };
const endpoint = `https://example.test/admin/api/session-brochures/${sessionId}`;
const storageKey = "preview/session-brochures/file.pdf";
const uploadEndpoint = "https://example.test/admin/api/session-brochures/upload";
const adminId = "123e4567-e89b-12d3-a456-426614174010";
const secret = "a".repeat(64);
const uploadIdentity = {
  adminUserId: adminId,
  sessionId,
  pendingBrochureId: brochureId,
  secret,
};
const activeRow = {
  id: brochureId,
  originalFilename: "guide.pdf",
  byteSize: 1024,
  activatedAt: new Date("2026-11-20T12:00:00Z"),
  storageKey,
};

function request(method: string, body?: object) {
  return new Request(endpoint, {
    method,
    headers: { origin: "https://example.test", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: adminId });
  mocks.detail.mockResolvedValue({ status: "DRAFT" });
  mocks.prepare.mockResolvedValue({
    pending: { id: brochureId, storageKey },
  });
  mocks.issue.mockResolvedValue({ secret: "secret", expiresAt: new Date() });
  mocks.storageConfiguration.mockReturnValue({
    storeId: "store_preview_123",
    webhookPublicKey: "preview-webhook-public-key",
  });
  mocks.runtimeOidcToken.mockResolvedValue("runtime-oidc-token");
  mocks.issueSignedToken.mockResolvedValue({
    clientSigningToken: "signed-token",
    delegationToken: "delegation-token",
    validUntil: Date.now() + 300_000,
  });
  mocks.isCompleted.mockResolvedValue(false);
  mocks.validateAuthorization.mockResolvedValue({
    pendingBrochure: { storageKey },
    expiresAt: new Date(Date.now() + 300_000),
  });
  mocks.finalizeAuthorizedUpload.mockResolvedValue(undefined);
  mocks.active.mockResolvedValue(null);
  mocks.remove.mockResolvedValue(undefined);
});

describe("admin brochure route boundary", () => {
  it("authenticates before attempting a mutation", async () => {
    mocks.admin.mockResolvedValue(null);
    const response = await POST(request("POST", {}), context);
    expect(response.status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request without preparing an upload", async () => {
    const response = await POST(
      new Request(endpoint, {
        method: "POST",
        headers: { origin: "https://other.test" },
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects a terminal session without issuing an authorization", async () => {
    mocks.detail.mockResolvedValue({ status: "COMPLETED" });
    const response = await POST(
      request("POST", {
        filename: "guide.pdf",
        byteSize: 20,
        sha256: "a".repeat(64),
        expectedActiveBrochureId: null,
      }),
      context,
    );
    expect(response.status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("binds preparation and issuance to the route session and current admin", async () => {
    const response = await POST(
      request("POST", {
        filename: "guide.pdf",
        byteSize: 20,
        sha256: "a".repeat(64),
        expectedActiveBrochureId: null,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ originalFilename: "guide.pdf" }),
    );
    expect(mocks.issue).toHaveBeenCalledWith({
      adminUserId: adminId,
      sessionId,
      pendingBrochureId: brochureId,
      expectedActiveBrochureId: null,
    });
  });

  it("requires the expected active version to remove a brochure", async () => {
    const invalid = await DELETE(request("DELETE", { expectedActiveBrochureId: "wrong" }), context);
    expect(invalid.status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
    const valid = await DELETE(
      request("DELETE", { expectedActiveBrochureId: brochureId }),
      context,
    );
    expect(valid.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(sessionId, brochureId);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/sessions/${sessionId}`);
  });

  it("returns a bounded admin-only status projection", async () => {
    mocks.active.mockResolvedValue({
      id: brochureId,
      originalFilename: "guide.pdf",
      byteSize: 1024,
      activatedAt: new Date("2026-11-20T12:00:00Z"),
      storageKey: "private-key",
    });
    const response = await GET(request("GET"), context);
    const body = await response.json();
    expect(body.active).toMatchObject({ id: brochureId, filename: "guide.pdf", byteSize: 1024 });
    expect(JSON.stringify(body)).not.toContain("private-key");
  });
});

describe("presigned upload issuance boundary", () => {
  function issuanceRequest(headers: Record<string, string> = { origin: "https://example.test" }) {
    return new Request(uploadEndpoint, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-presigned-url" }),
    });
  }

  it("issues an OIDC-signed single-object delegation without a provider callback", async () => {
    mocks.handleUploadPresigned.mockImplementationOnce(async (options) => {
      expect(options.onUploadCompleted).toBeUndefined();
      const signed = await options.getSignedToken(
        storageKey,
        JSON.stringify({ sessionId, pendingBrochureId: brochureId, secret }),
        false,
      );
      expect(signed.urlOptions).not.toHaveProperty("callbackUrl");
      expect(signed.urlOptions).not.toHaveProperty("tokenPayload");
      expect(signed.urlOptions).toMatchObject({ addRandomSuffix: false, allowOverwrite: false });
      return { type: "blob.generate-presigned-url" };
    });

    const response = await uploadRoute(issuanceRequest());

    expect(response.status).toBe(200);
    expect(mocks.validateAuthorization).toHaveBeenCalledWith(uploadIdentity);
    expect(mocks.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store_preview_123",
        oidcToken: "runtime-oidc-token",
        pathname: storageKey,
        operations: ["put"],
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 10 * 1024 * 1024,
      }),
    );
  });

  it("rejects provider completion callbacks without reaching the SDK or finalizing", async () => {
    const response = await uploadRoute(
      new Request(uploadEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-signature": "forged" },
        body: JSON.stringify({ type: "blob.upload-completed", payload: {} }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });

  it("requires an authenticated same-origin administrator before issuing a delegation", async () => {
    mocks.admin.mockResolvedValueOnce(null);
    const unauthenticated = await uploadRoute(issuanceRequest());
    const crossOrigin = await uploadRoute(issuanceRequest({ origin: "https://other.test" }));

    expect(unauthenticated.status).toBe(401);
    expect(crossOrigin.status).toBe(400);
    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
  });

  it("refuses a delegation for any object other than the authorized pending key", async () => {
    mocks.handleUploadPresigned.mockImplementationOnce(async (options) => {
      await options.getSignedToken(
        "preview/session-brochures/substituted.pdf",
        JSON.stringify({ sessionId, pendingBrochureId: brochureId, secret }),
        false,
      );
      return { type: "blob.generate-presigned-url" };
    });

    const response = await uploadRoute(issuanceRequest());

    expect(response.status).toBe(409);
    expect(mocks.issueSignedToken).not.toHaveBeenCalled();
  });

  it("does not issue a presigned upload delegation without a runtime OIDC credential", async () => {
    mocks.runtimeOidcToken.mockRejectedValueOnce(new Error("OIDC credential unavailable"));

    const response = await uploadRoute(issuanceRequest());

    expect(response.status).toBe(503);
    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
    expect(mocks.issueSignedToken).not.toHaveBeenCalled();
  });
});

describe("authenticated upload finalization boundary", () => {
  const finalizeEndpoint = `${endpoint}/finalize`;

  function finalizeRequest(
    body: object,
    headers: Record<string, string> = { origin: "https://example.test" },
  ) {
    return new Request(finalizeEndpoint, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function domainFailure(code: string, message = code) {
    return Object.assign(new Error(message), { code });
  }

  function activatesOnFinalize() {
    mocks.finalizeAuthorizedUpload.mockImplementationOnce(async () => {
      mocks.active.mockResolvedValue(activeRow);
      mocks.isCompleted.mockResolvedValue(true);
      return activeRow;
    });
  }

  it("verifies and activates the authorized version, confirming ACTIVE to the browser", async () => {
    activatesOnFinalize();

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.finalizeAuthorizedUpload).toHaveBeenCalledWith(uploadIdentity);
    expect(mocks.isCompleted).toHaveBeenLastCalledWith(uploadIdentity, storageKey);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/sessions/${sessionId}`);
    expect(body).toMatchObject({ state: "ACTIVE", active: { id: brochureId } });
    expect(JSON.stringify(body)).not.toContain(storageKey);
  });

  it("ignores client-supplied storage keys, checksums, URLs, identities, and success flags", async () => {
    activatesOnFinalize();

    await finalizeUpload(
      finalizeRequest({
        pendingBrochureId: brochureId,
        secret,
        adminUserId: "123e4567-e89b-12d3-a456-426614174099",
        storageKey: "preview/session-brochures/substituted.pdf",
        sha256: "b".repeat(64),
        url: "https://attacker.test/brochure.pdf",
        success: true,
      }),
      context,
    );

    expect(mocks.finalizeAuthorizedUpload).toHaveBeenCalledWith(uploadIdentity);
  });

  it("rejects unauthenticated and cross-origin finalization before any lookup", async () => {
    mocks.admin.mockResolvedValueOnce(null);
    const unauthenticated = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );
    const crossOrigin = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }, { origin: "https://other.test" }),
      context,
    );

    expect(unauthenticated.status).toBe(401);
    expect(crossOrigin.status).toBe(400);
    expect(mocks.active).not.toHaveBeenCalled();
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });

  it("rejects malformed identities without consulting the authorization", async () => {
    const malformed = [
      { pendingBrochureId: "not-a-uuid", secret },
      { pendingBrochureId: brochureId, secret: "short" },
      { pendingBrochureId: brochureId },
    ];

    for (const body of malformed) {
      const response = await finalizeUpload(finalizeRequest(body), context);
      expect(response.status).toBe(400);
    }
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["another administrator's or session's", "INVALID_AUTHORIZATION"],
    ["an expired, revoked, or consumed", "INVALID_AUTHORIZATION"],
    ["a no-longer-pending version's", "BROCHURE_NOT_PENDING"],
    ["a stale replacement's", "STALE_BROCHURE_STATE"],
    ["a terminal session's", "IMMUTABLE_SESSION"],
  ])("rejects %s authorization without activating", async (_label, code) => {
    mocks.finalizeAuthorizedUpload.mockRejectedValueOnce(domainFailure(code));

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns the confirmed ACTIVE version for a duplicate finalization without re-running it", async () => {
    mocks.active.mockResolvedValue(activeRow);
    mocks.isCompleted.mockResolvedValue(true);

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.isCompleted).toHaveBeenCalledWith(uploadIdentity, storageKey);
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });

  it("does not treat another authorization's active version as this finalization's success", async () => {
    mocks.active.mockResolvedValue(activeRow);
    mocks.isCompleted.mockResolvedValue(false);
    mocks.finalizeAuthorizedUpload.mockRejectedValueOnce(domainFailure("INVALID_AUTHORIZATION"));

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );

    expect(response.status).toBe(409);
  });

  it("reports success when a concurrent finalization of the same authorization won", async () => {
    mocks.finalizeAuthorizedUpload.mockImplementationOnce(async () => {
      mocks.active.mockResolvedValue(activeRow);
      mocks.isCompleted.mockResolvedValue(true);
      throw domainFailure("INVALID_AUTHORIZATION");
    });

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe("ACTIVE");
  });

  it("reports a missing private object as retryable and a malformed PDF as terminal", async () => {
    mocks.finalizeAuthorizedUpload.mockRejectedValueOnce(domainFailure("STORAGE_OBJECT_NOT_FOUND"));
    const missing = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );
    mocks.finalizeAuthorizedUpload.mockRejectedValueOnce(domainFailure("STORAGE_OBJECT_INVALID"));
    const malformed = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not leak private-storage failure details", async () => {
    mocks.finalizeAuthorizedUpload.mockRejectedValueOnce(
      domainFailure(
        "STORAGE_PROVIDER_FAILURE",
        `store_preview_123 ${storageKey} runtime-oidc-token unavailable`,
      ),
    );

    const response = await finalizeUpload(
      finalizeRequest({ pendingBrochureId: brochureId, secret }),
      context,
    );
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("store_preview_123");
    expect(text).not.toContain(storageKey);
    expect(text).not.toContain("runtime-oidc-token");
  });
});
