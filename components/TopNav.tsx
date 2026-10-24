"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/app", label: "Payments" },
  { href: "/setup", label: "Policies" },
  { href: "/evidence", label: "Audit trail" },
];

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/favicon-32x32.png" alt="" width={22} height={22} className="rounded-[5px]" />
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

  return (
    <header
      data-backend-sandbox={connection}
      className="shrink-0 border-b border-rule bg-surface"
    >
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-8 px-6">
        <Link href="/" aria-label="Sudibran dashboard">
          <Wordmark />
        </Link>
        <nav className="flex h-full items-stretch gap-1">
          {LINKS.map((l) => {
            const activeLink = l.href === "/" ? path === "/" : path === l.href || path.startsWith(l.href + "/");
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
        <div className="ml-auto flex items-center gap-4">
          <span
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
              connection === "offline"
                  ? "border-harm-line bg-harm-wash text-harm"
                  : "border-rule bg-paper text-ink-2"
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
          <span className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">M</span>
            <span className="leading-tight">
              <span className="block text-[13.5px] font-semibold">Maya</span>
              <span className="block text-[12px] text-ink-3">Accounts payable</span>
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
