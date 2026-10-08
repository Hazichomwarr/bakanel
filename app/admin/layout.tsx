import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Administration W'BAKENEL",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900">{children}</div>
      </body>
    </html>
  );
}
