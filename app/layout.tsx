import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bayanis — Data Governance Platform",
  description:
    "Bayanis is the data governance and catalog platform for NDMO, NDI, and PDPL compliance.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers renders every page per request, so each one carries
  // its own CSP nonce (middleware.ts) — a pre-rendered page would have none and its
  // scripts would be blocked.
  headers().get("x-nonce");
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
