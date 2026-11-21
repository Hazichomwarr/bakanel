import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  detail: vi.fn(),
  prepare: vi.fn(),
  issue: vi.fn(),
  validateAuthorization: vi.fn(),
  isCompleted: vi.fn(),
  finalizeAuthorizedUpload: vi.fn(),
  handleUpload: vi.fn(),
  storageConfiguration: vi.fn(),
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
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
vi.mock("@/lib/training-session-brochure.service", () => ({
  trainingSessionBrochureService: {
    getActiveBrochure: mocks.active,
    removeActiveBrochure: mocks.remove,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { DELETE, GET, POST } from "../app/admin/api/session-brochures/[sessionId]/route";
import { POST as uploadCallback } from "../app/admin/api/session-brochures/upload/route";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
const brochureId = "123e4567-e89b-12d3-a456-426614174001";
const context = { params: Promise.resolve({ sessionId }) };
const endpoint = `https://example.test/admin/api/session-brochures/${sessionId}`;
const storageKey = "preview/session-brochures/file.pdf";
const uploadEndpoint = "https://example.test/admin/api/session-brochures/upload";
const callbackIdentity = {
  adminUserId: "123e4567-e89b-12d3-a456-426614174010",
  sessionId,
  pendingBrochureId: brochureId,
  secret: "a".repeat(64),
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
  mocks.admin.mockResolvedValue({ id: "admin-1" });
  mocks.detail.mockResolvedValue({ status: "DRAFT" });
  mocks.prepare.mockResolvedValue({
    pending: { id: brochureId, storageKey },
  });
  mocks.issue.mockResolvedValue({ secret: "secret", expiresAt: new Date() });
  mocks.storageConfiguration.mockReturnValue({ token: "private-blob-token" });
  mocks.isCompleted.mockResolvedValue(false);
  mocks.validateAuthorization.mockResolvedValue({
    pendingBrochure: { storageKey },
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
      adminUserId: "admin-1",
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

describe("signed upload callback boundary", () => {
  function completedEvent(): Request {
    return new Request(uploadEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.upload-completed" }),
    });
  }

  it("finalizes only the authorization and object bound into the signed callback", async () => {
    mocks.handleUpload.mockImplementationOnce(async (options) => {
      await options.onUploadCompleted({
        blob: { pathname: storageKey },
        tokenPayload: JSON.stringify(callbackIdentity),
      });
      return { type: "blob.upload-completed" };
    });

    const response = await uploadCallback(completedEvent());

    expect(response.status).toBe(200);
    expect(mocks.isCompleted).toHaveBeenCalledWith(callbackIdentity, storageKey);
    expect(mocks.validateAuthorization).toHaveBeenCalledWith(callbackIdentity);
    expect(mocks.finalizeAuthorizedUpload).toHaveBeenCalledWith(callbackIdentity);
  });

  it("rejects a callback whose object pathname does not match its pending brochure", async () => {
    mocks.handleUpload.mockImplementationOnce(async (options) => {
      await options.onUploadCompleted({
        blob: { pathname: "preview/session-brochures/substituted.pdf" },
        tokenPayload: JSON.stringify(callbackIdentity),
      });
      return { type: "blob.upload-completed" };
    });

    const response = await uploadCallback(completedEvent());

    expect(response.status).toBe(503);
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });

  it("accepts a verified replay only after its authorization has completed", async () => {
    mocks.isCompleted.mockResolvedValue(true);
    mocks.handleUpload.mockImplementationOnce(async (options) => {
      await options.onUploadCompleted({
        blob: { pathname: storageKey },
        tokenPayload: JSON.stringify(callbackIdentity),
      });
      return { type: "blob.upload-completed" };
    });

    const response = await uploadCallback(completedEvent());

    expect(response.status).toBe(200);
    expect(mocks.validateAuthorization).not.toHaveBeenCalled();
    expect(mocks.finalizeAuthorizedUpload).not.toHaveBeenCalled();
  });
});
