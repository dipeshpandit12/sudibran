import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { AuthProvider } from "@/lib/auth";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sudibran · Autonomous Financial AI Cyber Defense",
  description: "Cryptographic trust mesh and zero-trust gate between autonomous AI agents and financial rails.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${jbmono.variable} antialiased`}>
      <body className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
        <AuthProvider>
          <div className="relative flex min-h-screen w-full flex-col bg-white text-black overflow-x-hidden">
            <TopNav />
            <main className="flex-1 flex flex-col">{children}</main>
            <footer className="mt-auto border-t border-gray-200 bg-white">
              <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-[13px] text-gray-600">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-600" />
                  Capital One Nessie Sandbox (Live) · CRS Identity Scoring (R7)
                </span>
                <span className="flex items-center gap-1.5 text-black font-medium text-[13px]">
                  Sudibran · Autonomous Financial AI Cyber Defense
                </span>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
