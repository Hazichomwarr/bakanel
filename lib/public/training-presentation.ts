import { DeliveryMode, PricingMode } from "@prisma/client";

import type { PublicSessionDto } from "./dto";
import type { PublicLocale } from "./locale";

type SessionPresentationCopy = {
  onlineLabel: string;
  inPersonLabel: string;
  locationPending: string;
  onRequestLabel: string;
  pricePending: string;
};

const localeFormats: Record<PublicLocale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  pt: "pt-PT",
};

/** Date-only database values are always formatted in UTC to avoid a local timezone day shift. */
export function formatPublicDate(locale: PublicLocale, value: Date) {
  return new Intl.DateTimeFormat(localeFormats[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatPublicDateRange(locale: PublicLocale, startDate: Date, endDate: Date) {
  if (startDate.getTime() === endDate.getTime()) {
    return formatPublicDate(locale, startDate);
  }

  return `${formatPublicDate(locale, startDate)} — ${formatPublicDate(locale, endDate)}`;
}

export function formatPublicSessionDelivery(
  session: Pick<PublicSessionDto, "deliveryMode" | "city" | "venue" | "country">,
  copy: SessionPresentationCopy,
) {
  if (session.deliveryMode === DeliveryMode.ONLINE) {
    return { delivery: copy.onlineLabel, location: copy.onlineLabel };
  }

  const location = [session.city, session.venue, session.country].filter((value): value is string =>
    Boolean(value),
  );

  return {
    delivery: copy.inPersonLabel,
    location: location.length > 0 ? location.join(" · ") : copy.locationPending,
  };
}

export function formatPublicSessionPrice(
  locale: PublicLocale,
  session: Pick<PublicSessionDto, "pricingMode" | "price" | "currency">,
  copy: SessionPresentationCopy,
) {
  if (session.pricingMode === PricingMode.ON_REQUEST) {
    return copy.onRequestLabel;
  }

  if (!session.price || !session.currency) {
    return copy.pricePending;
  }

  const amount = Number(session.price);
  if (!Number.isFinite(amount)) {
    return copy.pricePending;
  }

  const currency = session.currency === "XOF" ? "CFA" : session.currency;
  const formattedAmount = new Intl.NumberFormat(localeFormats[locale], {
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formattedAmount} ${currency}`;
}
