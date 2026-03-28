/**
 * layout.tsx — Root Next.js 15 layout.
 *
 * Applies:
 *  - Inter font from Google Fonts
 *  - Tailwind CSS base styles
 *  - Dark mode support via class strategy (prefers-color-scheme media query)
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RLAI Avatar Studios",
  description: "AI Avatar Platform by RLAI — rightleft.ai",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
