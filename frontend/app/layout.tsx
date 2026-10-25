import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const jbmono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Sudibran",
  description: "The black box for AI financial actions.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${jbmono.variable} antialiased`}>
      <head>
        {/* Settles the theme before the first paint, so there is no flash of the wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* Reveals hide their content until JavaScript scrolls them in; without it, show everything. */}
        <noscript>
          <style>{`.reveal,.stagger>*{opacity:1!important;animation:none!important}`}</style>
        </noscript>
        <TopNav />
        {children}
        <footer className="mt-auto border-t border-rule bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[13px] text-ink-2">
            <span>Payments run on the Nessie sandbox with CRS test identities.</span>
            <span>Sudibran · the black box for AI financial actions</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
