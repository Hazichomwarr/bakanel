import {
  authenticatedAdmin,
  brochureError,
  forbidden,
  invalidRequest,
  isUuid,
  sameOrigin,
} from "@/lib/admin/session-brochure.http";
import { brochureWorkflow, usesFakeBrochureStorage } from "@/lib/admin/session-brochure.server";
import { fakeBrochureStorage } from "@/lib/session-brochure-fake-storage";
import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!usesFakeBrochureStorage()) return new Response(null, { status: 404 });
  const admin = await authenticatedAdmin();
  if (!admin) return forbidden();
  if (!sameOrigin(request)) return invalidRequest();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !isUuid(body.sessionId) ||
      !isUuid(body.pendingBrochureId) ||
      typeof body.secret !== "string" ||
      typeof body.content !== "string"
    )
      return invalidRequest();
    const identity = {
      adminUserId: admin.id,
      sessionId: body.sessionId,
      pendingBrochureId: body.pendingBrochureId,
      secret: body.secret,
    };
    const authorization = await brochureUploadAuthorizationService.validate(identity);
    fakeBrochureStorage.put(
      authorization.pendingBrochure.storageKey,
      Uint8Array.from(atob(body.content), (character) => character.charCodeAt(0)),
    );
    await brochureWorkflow().finalizeAuthorizedUpload(identity);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return brochureError(error);
  }
}
