import { TrainingSessionBrochureState } from "@prisma/client";

import { brochureStorage } from "@/lib/admin/session-brochure.server";
import { prisma } from "@/lib/prisma";
import { publicSessionWhere } from "@/lib/public/eligibility";
import { isPublicLocale } from "@/lib/public/locale";
import { toPrismaLocale } from "@/lib/public/locale";

export const runtime = "nodejs";

const missing = () =>
  new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
const unavailable = () =>
  new Response(null, {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string; sessionId: string }> },
) {
  const { locale, slug, sessionId } = await params;
  if (
    !isPublicLocale(locale) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
    !slug.trim()
  )
    return missing();
  const session = await prisma.trainingSession.findFirst({
    where: {
      id: sessionId,
      ...publicSessionWhere(locale, new Date()),
      training: {
        is: { translations: { some: { locale: toPrismaLocale(locale), slug, isPublished: true } } },
      },
    },
    select: {
      brochures: {
        where: { state: TrainingSessionBrochureState.ACTIVE },
        take: 1,
        select: { storageKey: true, originalFilename: true },
      },
    },
  });
  const brochure = session?.brochures[0];
  if (!brochure) return missing();
  try {
    const object = await brochureStorage().getPrivateObject(brochure.storageKey);
    if (!object) return missing();
    const filename = brochure.originalFilename.replace(/["\\/\r\n]/g, "_");
    return new Response(object.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable();
  }
}
