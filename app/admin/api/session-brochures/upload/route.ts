import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
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
import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";
import { MAX_BROCHURE_SIZE_BYTES } from "@/lib/session-brochure.constants";

export const runtime = "nodejs";

type UploadIdentity = {
  adminUserId: string;
  sessionId: string;
  pendingBrochureId: string;
  secret: string;
};

function parseIdentity(value: string | null): UploadIdentity | null {
  try {
    const candidate = JSON.parse(value ?? "") as Record<string, unknown>;
    if (
      !isUuid(candidate.adminUserId) ||
      !isUuid(candidate.sessionId) ||
      !isUuid(candidate.pendingBrochureId) ||
      typeof candidate.secret !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.secret)
    )
      return null;
    return candidate as UploadIdentity;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 16_384) return invalidRequest();
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return invalidRequest();
  }
  if (body?.type !== "blob.generate-client-token" && body?.type !== "blob.upload-completed")
    return invalidRequest();

  if (body.type === "blob.generate-client-token") {
    const admin = await authenticatedAdmin();
    if (!admin) return forbidden();
    if (!sameOrigin(request)) return invalidRequest();
  }

  try {
    const configuration = await import("@/lib/session-brochure-storage").then((module) =>
      module.resolveVercelPrivateBlobConfiguration(process.env),
    );
    const result = await handleUpload({
      request,
      body,
      token: configuration.token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const admin = await authenticatedAdmin();
        let submitted: Record<string, unknown>;
        try {
          submitted = JSON.parse(clientPayload ?? "") as Record<string, unknown>;
        } catch {
          throw new Error("Invalid upload authorization");
        }
        if (
          !admin ||
          !isUuid(submitted.sessionId) ||
          !isUuid(submitted.pendingBrochureId) ||
          typeof submitted.secret !== "string"
        )
          throw new Error("Invalid upload authorization");
        const identity = {
          adminUserId: admin.id,
          sessionId: submitted.sessionId,
          pendingBrochureId: submitted.pendingBrochureId,
          secret: submitted.secret,
        };
        const authorization = await brochureUploadAuthorizationService.validate(identity);
        if (pathname !== authorization.pendingBrochure.storageKey)
          throw new Error("Invalid upload pathname");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_BROCHURE_SIZE_BYTES,
          validUntil: authorization.expiresAt.getTime(),
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify(identity),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // handleUpload authenticates this event's provider signature before invoking this callback.
        const identity = parseIdentity(tokenPayload ?? null);
        if (!identity) throw new Error("Invalid upload callback");
        if (await brochureUploadAuthorizationService.isCompleted(identity, blob.pathname)) return;
        const authorization = await brochureUploadAuthorizationService.validate(identity);
        if (blob.pathname !== authorization.pendingBrochure.storageKey)
          throw new Error("Invalid upload callback object");
        await brochureWorkflow().finalizeAuthorizedUpload(identity);
        revalidatePath(`/admin/sessions/${identity.sessionId}`);
      },
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return brochureError(error);
  }
}
