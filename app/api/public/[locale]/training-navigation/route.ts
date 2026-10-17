import { isPublicLocale } from "@/lib/public/locale";
import { publicTrainingNavigationReader } from "@/lib/public/training-navigation.read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
};

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    return new Response(null, { status: 404, headers: noStoreHeaders });
  }

  try {
    const navigation = await publicTrainingNavigationReader.getPublicTrainingNavigation(locale);
    return Response.json(navigation, { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: noStoreHeaders });
  }
}
