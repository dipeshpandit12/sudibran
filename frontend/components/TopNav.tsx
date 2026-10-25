"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";

// The public bar carries the story. Everything operational lives behind
// "Open dashboard", in that page's own left panel.
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/#contact", label: "Contact" },
];

/** Routes that belong to the dashboard, and so get its chrome instead. */
export const DASH_ROUTES = ["/dashboard", "/app", "/setup", "/evidence"];

export function isDashRoute(path: string) {
  return DASH_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/logo.png" alt="" width={22} height={22} className="rounded-[5px] object-contain" />
      <span className="display text-[19px]">Sudibran</span>
    </span>
  );
}

export function TopNav() {
  const path = usePathname();
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");

  useEffect(() => {
    let active = true;

    async function checkBackend() {
      try {
        const health = await api.health();
        const connected =
          health.status === "ok" && health.integrations?.payment_rail?.mode === "live" && health.integrations?.crs?.mode === "live";
        if (active) setConnection(connected ? "connected" : "offline");
      } catch {
        if (active) setConnection("offline");
      }
    }

    void checkBackend();
    const timer = window.setInterval(() => void checkBackend(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const connected = connection === "connected";
  const statusLabel = connected ? "Sandbox connected" : connection === "checking" ? "Checking backend" : "Backend offline";
  const onDash = isDashRoute(path);

  return (
    <header data-backend-sandbox={connection} className="sticky top-0 z-30 shrink-0 border-b border-rule bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-8 px-6">
        <Link href="/" aria-label="Sudibran overview">
          <Wordmark />
        </Link>
        <nav className="flex h-full items-stretch gap-1">
          {LINKS.map((l) => {
            const activeLink = l.href === "/" ? path === "/" : false;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={activeLink ? "page" : undefined}
                className={`flex items-center border-b-2 px-3 text-[14px] font-medium transition-colors ${
                  activeLink ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {onDash && (
            <span
              role="status"
              aria-live="polite"
              className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold sm:flex ${
                connection === "offline" ? "border-harm-line bg-harm-wash text-harm" : "border-rule bg-paper text-ink-2"
              }`}
              title={
                connected
                  ? "FastAPI is healthy and the Nessie and CRS sandboxes are connected. No real money moves."
                  : "Waiting for a healthy FastAPI connection to the Nessie and CRS sandboxes."
              }
            >
              <span className={`size-2 rounded-full ${connected ? "bg-safe" : connection === "offline" ? "bg-harm" : "bg-flag"}`} />
              {statusLabel}
            </span>
          )}
          <ThemeToggle />
          {!onDash && (
            <Link
              href="/dashboard"
              className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-onink transition-colors hover:bg-ink/90"
            >
              Open dashboard
            </Link>
          )}
          <span className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-onink">M</span>
            <span className="hidden leading-tight lg:block">
              <span className="block text-[13.5px] font-semibold">Maya</span>
              <span className="block text-[12px] text-ink-3">Accounts payable</span>
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
