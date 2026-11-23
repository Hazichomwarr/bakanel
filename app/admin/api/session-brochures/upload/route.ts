import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";

import {
  authenticatedAdmin,
  brochureError,
  forbidden,
  invalidRequest,
  isUuid,
  sameOrigin,
} from "@/lib/admin/session-brochure.http";
import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";
import { MAX_BROCHURE_SIZE_BYTES } from "@/lib/session-brochure.constants";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16_384;
const PDF_CONTENT_TYPES = ["application/pdf"];

class InvalidUploadAuthorization extends Error {
  readonly code = "INVALID_AUTHORIZATION";
}

function parseClientPayload(clientPayload: string | null) {
  let submitted: Record<string, unknown>;

  try {
    submitted = JSON.parse(clientPayload ?? "") as Record<string, unknown>;
  } catch {
    throw new InvalidUploadAuthorization();
  }

  if (
    !isUuid(submitted.sessionId) ||
    !isUuid(submitted.pendingBrochureId) ||
    typeof submitted.secret !== "string"
  ) {
    throw new InvalidUploadAuthorization();
  }

  return {
    sessionId: submitted.sessionId,
    pendingBrochureId: submitted.pendingBrochureId,
    secret: submitted.secret,
  };
}

/**
 * Issues a short-lived, single-object presigned PUT for an authorized pending brochure.
 *
 * Completion is not reported by the storage provider: no completion handler or callback URL is
 * configured, so the SDK signs no callback into the upload URL. The browser instead calls the
 * authenticated finalization endpoint, which verifies the private object independently.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return invalidRequest();
  }

  let body: HandleUploadPresignedBody;

  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return invalidRequest();
  }

  // Provider completion callbacks are no longer part of the brochure lifecycle.
  if (body?.type !== "blob.generate-presigned-url") {
    return invalidRequest();
  }

  const admin = await authenticatedAdmin();

  if (!admin) {
    return forbidden();
  }

  if (!sameOrigin(request)) {
    return invalidRequest();
  }

  try {
    const storageModule = await import("@/lib/session-brochure-storage");
    const configuration = storageModule.resolveVercelPrivateBlobConfiguration(process.env);
    const oidcToken = await storageModule.resolveRuntimeOidcToken();

    const result = await handleUploadPresigned({
      request,
      body,
      // Required by the SDK signature; never used because callback events are rejected above.
      webhookPublicKey: configuration.webhookPublicKey,
      getSignedToken: async (pathname, clientPayload) => {
        const submitted = parseClientPayload(clientPayload);
        const authorization = await brochureUploadAuthorizationService.validate({
          adminUserId: admin.id,
          sessionId: submitted.sessionId,
          pendingBrochureId: submitted.pendingBrochureId,
          secret: submitted.secret,
        });

        if (pathname !== authorization.pendingBrochure.storageKey) {
          throw new InvalidUploadAuthorization();
        }

        const validUntil = authorization.expiresAt.getTime();
        const token = await issueSignedToken({
          storeId: configuration.storeId,
          oidcToken,
          pathname,
          operations: ["put"],
          allowedContentTypes: PDF_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BROCHURE_SIZE_BYTES,
          validUntil,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: PDF_CONTENT_TYPES,
            maximumSizeInBytes: MAX_BROCHURE_SIZE_BYTES,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
    });

    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return brochureError(error);
  }
}
