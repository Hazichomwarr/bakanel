import { revalidatePath } from "next/cache";

import {
  authenticatedAdmin,
  brochureError,
  forbidden,
  invalidRequest,
  isUuid,
  sameOrigin,
} from "@/lib/admin/session-brochure.http";
import { brochureWorkflow, usesFakeBrochureStorage } from "@/lib/admin/session-brochure.server";
import { adminSessionsReader } from "@/lib/admin/sessions.read";
import { trainingSessionBrochureService } from "@/lib/training-session-brochure.service";
import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";
import { MAX_BROCHURE_SIZE_BYTES } from "@/lib/session-brochure.constants";

export const runtime = "nodejs";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  const admin = await authenticatedAdmin();
  if (!admin) return forbidden();
  if (!sameOrigin(request)) return invalidRequest();
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) return invalidRequest();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest();
  }
  if (!input || typeof input !== "object") return invalidRequest();
  const data = input as Record<string, unknown>;
  if (
    typeof data.filename !== "string" ||
    typeof data.sha256 !== "string" ||
    !Number.isInteger(data.byteSize) ||
    Number(data.byteSize) < 1 ||
    Number(data.byteSize) > MAX_BROCHURE_SIZE_BYTES ||
    (data.expectedActiveBrochureId !== null && !isUuid(data.expectedActiveBrochureId))
  )
    return invalidRequest();
  const session = await adminSessionsReader.detail(sessionId);
  if (!session) return Response.json({ error: "Session introuvable." }, { status: 404 });
  if (!["DRAFT", "OPEN", "CLOSED"].includes(session.status))
    return brochureError({ code: "IMMUTABLE_SESSION" });
  try {
    const prepared = await brochureWorkflow().preparePendingUpload(sessionId, {
      originalFilename: data.filename,
      mimeType: "application/pdf",
      byteSize: Number(data.byteSize),
      sha256: data.sha256,
    });
    const authorization = await brochureUploadAuthorizationService.issue({
      adminUserId: admin.id,
      sessionId,
      pendingBrochureId: prepared.pending.id,
      expectedActiveBrochureId: data.expectedActiveBrochureId,
    });
    return Response.json(
      {
        pendingBrochureId: prepared.pending.id,
        storageKey: prepared.pending.storageKey,
        secret: authorization.secret,
        expiresAt: authorization.expiresAt,
        transport: usesFakeBrochureStorage() ? "fake" : "vercel-blob",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return brochureError(error);
  }
}

export async function GET(_request: Request, context: Context) {
  const admin = await authenticatedAdmin();
  if (!admin) return forbidden();
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) return invalidRequest();
  const active = await trainingSessionBrochureService.getActiveBrochure(sessionId);
  return Response.json(
    {
      active: active
        ? {
            id: active.id,
            filename: active.originalFilename,
            byteSize: active.byteSize,
            uploadedAt: active.activatedAt,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request, context: Context) {
  const admin = await authenticatedAdmin();
  if (!admin) return forbidden();
  if (!sameOrigin(request)) return invalidRequest();
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) return invalidRequest();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest();
  }
  const expectedActiveBrochureId =
    typeof input === "object" && input !== null && "expectedActiveBrochureId" in input
      ? input.expectedActiveBrochureId
      : null;
  if (!isUuid(expectedActiveBrochureId)) return invalidRequest();
  try {
    await trainingSessionBrochureService.removeActiveBrochure(sessionId, expectedActiveBrochureId);
    revalidatePath(`/admin/sessions/${sessionId}`);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return brochureError(error);
  }
}
