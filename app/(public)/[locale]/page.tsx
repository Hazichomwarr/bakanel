import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomeComplementaryServices } from "./_components/home-complementary-services";
import { HomeContactCta } from "./_components/home-contact-cta";
import { HomeHero } from "./_components/home-hero";
import { HomeIntroduction } from "./_components/home-introduction";
import { HomeTrainingDomains } from "./_components/home-training-domains";
import { HomeTrainingPreview } from "./_components/home-training-preview";
import { dictionaries } from "@/lib/public/content";
import { getHomepageTrainingPreview } from "@/lib/public/homepage";
import { isPublicLocale } from "@/lib/public/locale";

export const dynamic = "force-dynamic";

type PublicHomepageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PublicHomepageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    return {};
  }

  const dictionary = dictionaries[locale];

  return {
    title: "W'BAKENEL Consulting Institute",
    description: dictionary.home.heroDescription,
  };
}

export default async function PublicHomepage({ params }: PublicHomepageProps) {
  const { locale } = await params;

  if (!isPublicLocale(locale)) {
    notFound();
  }

  const dictionary = dictionaries[locale];
  const trainingPreview = await getHomepageTrainingPreview(locale);

  return (
    <>
      <HomeHero dictionary={dictionary.home} />
      <HomeTrainingDomains
        locale={locale}
        dictionary={dictionary.home}
        domains={dictionary.trainingDomains}
      />
      <HomeTrainingPreview dictionary={dictionary.home} preview={trainingPreview} />
      <HomeIntroduction dictionary={dictionary.home} />
      <HomeComplementaryServices locale={locale} dictionary={dictionary} />
      <HomeContactCta dictionary={dictionary.home} />
    </>
  );
}
