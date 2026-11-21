import {
  authenticatedAdmin,
  brochureError,
  forbidden,
  invalidRequest,
  isUuid,
} from "@/lib/admin/session-brochure.http";
import { brochureStorage } from "@/lib/admin/session-brochure.server";
import { trainingSessionBrochureService } from "@/lib/training-session-brochure.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const admin = await authenticatedAdmin();
  if (!admin) return forbidden();
  const { sessionId } = await params;
  if (!isUuid(sessionId)) return invalidRequest();
  const active = await trainingSessionBrochureService.getActiveBrochure(sessionId);
  if (!active) return Response.json({ error: "Aucune brochure active." }, { status: 404 });
  try {
    const object = await brochureStorage().getPrivateObject(active.storageKey);
    if (!object) return Response.json({ error: "Brochure indisponible." }, { status: 404 });
    const filename = active.originalFilename.replace(/["\\\r\n]/g, "_");
    return new Response(object.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(object.metadata.byteSize),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return brochureError(error);
  }
}
