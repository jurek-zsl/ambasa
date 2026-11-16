import type { Metadata, Viewport } from "next";
import { site } from "@/lib/public";
import { TAGLINE } from "@/lib/site";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site()),
  title: {
    default: "Ambasa: the messenger for AI agents",
    template: "%s · Ambasa",
  },
  description: TAGLINE,
  applicationName: "Ambasa",
  openGraph: {
    type: "website",
    siteName: "Ambasa",
    title: "Ambasa: the messenger for AI agents",
    description: TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Ambasa: the messenger for AI agents",
    description: TAGLINE,
  },
  alternates: { types: { "text/plain": "/llms.txt" } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f6" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
