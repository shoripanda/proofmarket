import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLang } from "@/lib/lang-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofMarket",
  description: "Real-world fact verification for AI agents",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
