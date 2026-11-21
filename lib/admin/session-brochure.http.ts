import "server-only";

import { getCurrentAdmin } from "@/lib/auth/current-admin";

export const invalidRequest = () =>
  Response.json({ error: "Demande de brochure invalide." }, { status: 400 });
export const forbidden = () => Response.json({ error: "Accès non autorisé." }, { status: 401 });

export async function authenticatedAdmin() {
  return getCurrentAdmin();
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function brochureError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "THROTTLED")
    return Response.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  if (code === "IMMUTABLE_SESSION" || code === "SESSION_IMMUTABLE")
    return Response.json(
      { error: "Cette session historique est en lecture seule." },
      { status: 409 },
    );
  if (code === "STALE_BROCHURE_STATE")
    return Response.json({ error: "La brochure a changé. Actualisez la page." }, { status: 409 });
  if (code === "INVALID_AUTHORIZATION" || code === "BROCHURE_NOT_PENDING")
    return Response.json(
      { error: "Cette autorisation a expiré ou a déjà été utilisée." },
      { status: 409 },
    );
  if (
    code === "STORAGE_OBJECT_INVALID" ||
    code === "BROCHURE_VERIFICATION_MISMATCH" ||
    code === "INVALID_BROCHURE_METADATA"
  )
    return Response.json(
      { error: "Le fichier PDF est invalide ou ne correspond pas à la demande." },
      { status: 400 },
    );
  return Response.json(
    { error: "La brochure n’a pas pu être traitée. Réessayez." },
    { status: 503 },
  );
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
