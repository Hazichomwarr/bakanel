import "server-only";

/** The only text an administrator sees for a failure that is not an expected domain error. */
export const UNEXPECTED_ADMIN_ACTION_MESSAGE =
  "Une erreur technique est survenue. Réessayez dans un instant.";

export type AdminActionArea = "articles" | "catalogue" | "clients" | "experts" | "sessions";

export type AdminActionErrorDiagnostic = {
  event: "admin_action_unexpected_error";
  area: AdminActionArea;
  errorName: string;
  prismaCode?: string;
};

const PRISMA_ERROR_CODE = /^P\d{4}$/;

/**
 * Structured, allowlisted diagnostic. The error message, stack, cause, and submitted form data
 * are never included: Prisma and driver messages can quote query arguments or connection
 * details, and form data can contain private content.
 */
export function adminActionErrorDiagnostic(
  area: AdminActionArea,
  error: unknown,
): AdminActionErrorDiagnostic {
  const diagnostic: AdminActionErrorDiagnostic = {
    event: "admin_action_unexpected_error",
    area,
    errorName: error instanceof Error ? error.name : typeof error,
  };

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;

    if (typeof code === "string" && PRISMA_ERROR_CODE.test(code)) {
      diagnostic.prismaCode = code;
    }
  }

  return diagnostic;
}

/**
 * Called once per failed action, only for errors that are not expected domain errors, so
 * validation and lifecycle refusals do not produce operational noise. Returns the generic
 * user-facing message.
 */
export function unexpectedAdminActionError(area: AdminActionArea, error: unknown) {
  console.error(JSON.stringify(adminActionErrorDiagnostic(area, error)));

  return UNEXPECTED_ADMIN_ACTION_MESSAGE;
}
