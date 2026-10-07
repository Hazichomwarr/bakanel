export type DashboardPricing = {
  pricingMode: "FIXED" | "ON_REQUEST";
  price: string | null;
  currency: string | null;
};

export function formatDashboardDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDashboardPrice(pricing: DashboardPricing) {
  if (pricing.pricingMode === "ON_REQUEST") return "Sur devis";
  if (!pricing.price || !pricing.currency) return "Tarif à confirmer";

  const amount = Number(pricing.price);
  const currency = pricing.currency === "XOF" ? "CFA" : pricing.currency;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

export function dashboardSessionStatusLabel(status: string) {
  return status === "OPEN" ? "Inscriptions ouvertes" : "Inscriptions closes";
}
