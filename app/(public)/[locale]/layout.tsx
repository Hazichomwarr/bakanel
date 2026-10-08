import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";

import "../../globals.css";
import { dictionaries } from "@/lib/public/content";
import { isPublicLocale, publicLocales } from "@/lib/public/locale";
import { PublicShell } from "./_components/public-shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const dynamicParams = false;

export function generateStaticParams() {
  return publicLocales.map((locale) => ({ locale }));
}

export default async function PublicLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <PublicShell locale={locale} dictionary={dictionaries[locale]}>
          {children}
        </PublicShell>
      </body>
    </html>
  );
}
