import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./cuentas.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cuentas — Tu presupuesto, con claridad",
  description: "Un espacio tranquilo para organizar tu dinero quincenal.",
  manifest: "/manifest.webmanifest",
  applicationName: "Cuentas",
  appleWebApp: { capable: true, title: "Cuentas", statusBarStyle: "default" },
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, themeColor: "#faf9f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
