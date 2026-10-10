import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ServiceDetail } from "../_components/service-detail";
import { dictionaries } from "@/lib/public/content";
import { isPublicLocale } from "@/lib/public/locale";
import { localizedAlternates } from "@/lib/public/seo";
import {
  isServiceSlug,
  serviceDetailMetadata,
  serviceHref,
  serviceSlugs,
} from "@/lib/public/services";

// Only the allowlisted service slugs exist; any other segment returns 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return serviceSlugs.map((service) => ({ service }));
}

type ServiceDetailPageProps = {
  params: Promise<{ locale: string; service: string }>;
};

export async function generateMetadata({ params }: ServiceDetailPageProps): Promise<Metadata> {
  const { locale, service } = await params;

  if (!isPublicLocale(locale) || !isServiceSlug(service)) {
    return {};
  }

  return {
    ...serviceDetailMetadata(dictionaries[locale], service),
    alternates: localizedAlternates((targetLocale) => serviceHref(targetLocale, service), locale),
  };
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, service } = await params;

  if (!isPublicLocale(locale) || !isServiceSlug(service)) {
    notFound();
  }

  return <ServiceDetail locale={locale} slug={service} dictionary={dictionaries[locale]} />;
}
