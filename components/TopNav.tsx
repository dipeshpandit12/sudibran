"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <header className="shrink-0 border-b border-rule bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-8 px-6">
      <Link href="/" aria-label="Sudibran dashboard">
        <Wordmark />
      </Link>
      <nav className="flex h-full items-stretch gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center border-b-2 px-3 text-[14px] font-medium transition-colors ${
                active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <span
          className="flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-1 text-[12.5px] font-semibold text-ink-2"
          title="Runs against the Nessie sandbox bank and CRS test identities. No real money moves."
        >
          <span className="size-2 rounded-full bg-flag" />
          Sandbox
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
