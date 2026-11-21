import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
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
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return invalidRequest();
  }
  if (body?.type !== "blob.generate-presigned-url" && body?.type !== "blob.upload-completed")
    return invalidRequest();

  if (body.type === "blob.generate-presigned-url") {
    const admin = await authenticatedAdmin();
    if (!admin) return forbidden();
    if (!sameOrigin(request)) return invalidRequest();
  }

  try {
    const storageModule = await import("@/lib/session-brochure-storage");
    const configuration = storageModule.resolveVercelPrivateBlobConfiguration(process.env);
    const oidcToken = await storageModule.resolveRuntimeOidcToken();
    const result = await handleUploadPresigned({
      request,
      body,
      webhookPublicKey: configuration.webhookPublicKey,
      getSignedToken: async (pathname, clientPayload) => {
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
          token: await issueSignedToken({
            storeId: configuration.storeId,
            oidcToken,
            pathname,
            operations: ["put"],
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: MAX_BROCHURE_SIZE_BYTES,
            validUntil: authorization.expiresAt.getTime(),
          }),
          urlOptions: {
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: MAX_BROCHURE_SIZE_BYTES,
            validUntil: authorization.expiresAt.getTime(),
            addRandomSuffix: false,
            allowOverwrite: false,
            tokenPayload: JSON.stringify(identity),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // handleUploadPresigned authenticates this event's Ed25519 provider signature first.
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
