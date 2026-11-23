import { revalidatePath } from "next/cache";

import {
  authenticatedAdmin,
  brochureError,
  forbidden,
  invalidRequest,
  isUuid,
  sameOrigin,
} from "@/lib/admin/session-brochure.http";
import { brochureWorkflow } from "@/lib/admin/session-brochure.server";
import { trainingSessionBrochureService } from "@/lib/training-session-brochure.service";
import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4_096;
const AUTHORIZATION_SECRET_PATTERN = /^[a-f0-9]{64}$/;

type Context = { params: Promise<{ sessionId: string }> };

type UploadIdentity = {
  adminUserId: string;
  sessionId: string;
  pendingBrochureId: string;
  secret: string;
};

/**
 * Returns the active brochure only when it is the version this exact authorization activated.
 * A consumed authorization from another administrator, session, or version never matches.
 */
async function activeBrochureCompletedBy(identity: UploadIdentity) {
  const active = await trainingSessionBrochureService.getActiveBrochure(identity.sessionId);

  if (!active || active.id !== identity.pendingBrochureId) {
    return null;
  }

  const completed = await brochureUploadAuthorizationService.isCompleted(
    identity,
    active.storageKey,
  );

  return completed ? active : null;
}

function activeResponse(active: {
  id: string;
  originalFilename: string;
  byteSize: number;
  activatedAt: Date | null;
}) {
  return Response.json(
    {
      state: "ACTIVE",
      active: {
        id: active.id,
        filename: active.originalFilename,
        byteSize: active.byteSize,
        uploadedAt: active.activatedAt,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Finalizes a browser-completed presigned upload. The request carries only the authorization
 * identity; the storage key, size, checksum, and completion are established server-side from the
 * durable authorization and the private object itself.
 */
export async function POST(request: Request, context: Context) {
  const admin = await authenticatedAdmin();

  if (!admin) {
    return forbidden();
  }

  if (!sameOrigin(request)) {
    return invalidRequest();
  }

  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return invalidRequest();
  }

  const { sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return invalidRequest();
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return invalidRequest();
  }

  if (!input || typeof input !== "object") {
    return invalidRequest();
  }

  const data = input as Record<string, unknown>;

  if (
    !isUuid(data.pendingBrochureId) ||
    typeof data.secret !== "string" ||
    !AUTHORIZATION_SECRET_PATTERN.test(data.secret)
  ) {
    return invalidRequest();
  }

  const identity: UploadIdentity = {
    adminUserId: admin.id,
    sessionId,
    pendingBrochureId: data.pendingBrochureId,
    secret: data.secret,
  };

  try {
    const alreadyActive = await activeBrochureCompletedBy(identity);

    if (alreadyActive) {
      return activeResponse(alreadyActive);
    }

    await brochureWorkflow().finalizeAuthorizedUpload(identity);
    revalidatePath(`/admin/sessions/${sessionId}`);

    const active = await activeBrochureCompletedBy(identity);

    if (!active) {
      // The version was activated but superseded before this response; report it as stale.
      return brochureError({ code: "STALE_BROCHURE_STATE" });
    }

    return activeResponse(active);
  } catch (error) {
    // A concurrent finalization of the same authorization may have won the transaction.
    const completedConcurrently = await activeBrochureCompletedBy(identity).catch(() => null);

    if (completedConcurrently) {
      return activeResponse(completedConcurrently);
    }

    return brochureError(error);
  }
}
