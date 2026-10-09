import "server-only";

import { Prisma } from "@prisma/client";

import type { PublicTrainingDto } from "./dto";
import type { PublicLocale } from "./locale";
import { publicTrainingReader } from "./training.read";

export const HOMEPAGE_TRAINING_LIMIT = 3;
export { WHATSAPP_CONTACT_URL } from "./contact";

type HomepageTrainingReader = {
  listPublicTrainings(
    locale: PublicLocale,
    options: { limit: number },
  ): Promise<PublicTrainingDto[]>;
};

/**
 * "empty" means the reader answered with no eligible training; "unavailable" means it could
 * not answer. The two are presented differently so visitors are never told that no training
 * exists when the catalogue simply could not be read.
 */
export type HomepageTrainingPreview =
  | { status: "available"; trainings: PublicTrainingDto[] }
  | { status: "empty" }
  | { status: "unavailable" };

/**
 * Database unavailability (unreachable server, timeouts, failed connection setup) surfaces as
 * one of these classes. Anything else, such as a malformed query or a TypeError, is a
 * programming error and must not be disguised as a temporary outage.
 */
function isOperationalDatabaseError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

function databaseErrorLabel(error: Error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.name} ${error.code}`;
  }

  return error.name;
}

/**
 * Reads the homepage preview through the canonical public reader, so publication eligibility
 * still applies. Database unavailability is contained here so the rest of the homepage keeps
 * rendering; other errors propagate.
 */
export async function getHomepageTrainingPreview(
  locale: PublicLocale,
  reader: HomepageTrainingReader = publicTrainingReader,
): Promise<HomepageTrainingPreview> {
  let trainings: PublicTrainingDto[];

  try {
    trainings = await reader.listPublicTrainings(locale, { limit: HOMEPAGE_TRAINING_LIMIT });
  } catch (error) {
    if (!isOperationalDatabaseError(error)) {
      throw error;
    }

    // Only the error class and Prisma code are logged: messages can include connection details.
    console.error(`Homepage training preview unavailable (${databaseErrorLabel(error)}).`);

    return { status: "unavailable" };
  }

  if (trainings.length === 0) {
    return { status: "empty" };
  }

  return { status: "available", trainings };
}
