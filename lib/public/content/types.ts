import type { ServiceSlug } from "../services";
import type { TrainingDomainKey } from "../training-domains";

export type HomeDictionary = {
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  trainingCta: string;
  heroContactCta: string;
  domainsDetailCta: string;
  trainingEyebrow: string;
  trainingTitle: string;
  trainingDescription: string;
  trainingEmpty: string;
  trainingUnavailable: string;
  trainingNoSummary: string;
  introductionEyebrow: string;
  introductionTitle: string;
  introductionDescription: string;
  complementaryEyebrow: string;
  complementaryTitle: string;
  complementaryDescription: string;
  complementaryOverviewCta: string;
  contactEyebrow: string;
  contactTitle: string;
  contactDescription: string;
  contactCta: string;
};

export type TrainingDomainContent = {
  name: string;
  description: string;
};

export type TrainingDomainsDictionary = {
  eyebrow: string;
  title: string;
  description: string;
  priorityLabel: string;
  note: string;
  items: Record<TrainingDomainKey, TrainingDomainContent>;
};

export type ServiceContent = {
  name: string;
  metaDescription: string;
  summary: string;
  audience: string;
  support: string;
  heroTitle: string;
  heroDescription: string;
  imageAlt: string;
  explanationTitle: string;
  explanation: string[];
  needs: string[];
  areas: string[];
  approach: Array<{
    title: string;
    description: string;
  }>;
  notice: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaLabel: string;
};

export type ServicesDictionary = {
  breadcrumbLabel: string;
  homeLabel: string;
  overview: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    description: string;
    positioningEyebrow: string;
    positioningTitle: string;
    positioning: string[];
    primaryEyebrow: string;
    domainsLabel: string;
    complementaryEyebrow: string;
    complementaryTitle: string;
    complementaryDescription: string;
    audienceLabel: string;
    supportLabel: string;
    linkLabel: string;
    ctaEyebrow: string;
    ctaTitle: string;
    ctaDescription: string;
    ctaLabel: string;
  };
  detail: {
    explanationEyebrow: string;
    needsEyebrow: string;
    needsTitle: string;
    areasEyebrow: string;
    areasTitle: string;
    areasNote: string;
    approachEyebrow: string;
    approachTitle: string;
    noticeLabel: string;
    backToServices: string;
    otherServicesTitle: string;
  };
  items: Record<ServiceSlug, ServiceContent>;
};

export type PublicDictionary = {
  localeName: string;
  skipToContent: string;
  navigation: string;
  contact: string;
  menu: string;
  closeMenu: string;
  descriptor: string;
  preparing: string;
  notFound: string;
  error: string;
  homeNav: string;
  trainingsNav: string;
  aboutNav: string;
  servicesNav: string;
  languageSelector: string;
  home: HomeDictionary;
  trainingDomains: TrainingDomainsDictionary;
  services: ServicesDictionary;
};
