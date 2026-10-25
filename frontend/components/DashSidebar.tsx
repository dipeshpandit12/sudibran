"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/*
  The dashboard's left panel. Everything that used to sit in the top bar lives
  here, grouped by what you are doing: prove it, then run it.
*/
const GROUPS: { label: string; items: { href: string; label: string; hint: string; icon: ReactNode }[] }[] = [
  {
    label: "Prove it",
    items: [
      { href: "/dashboard", label: "Protection flow", hint: "Test an injection", icon: <FlowIcon /> },
    ],
  },
  {
    label: "Run it",
    items: [
      { href: "/app", label: "Payments", hint: "Approvals and invoices", icon: <PaymentIcon /> },
      { href: "/setup", label: "Policies", hint: "Intent, rules, components", icon: <PolicyIcon /> },
      { href: "/evidence", label: "Audit trail", hint: "Every decision on record", icon: <LedgerIcon /> },
    ],
  },
];

export function DashSidebar() {
  const path = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-20 lg:block lg:overflow-visible lg:pb-0">
      {GROUPS.map((g) => (
        <div key={g.label} className="shrink-0 lg:mb-6 lg:shrink">
          <p className="hidden px-3 pb-2 text-[11.5px] font-bold tracking-[0.08em] text-ink-3 uppercase lg:block">{g.label}</p>
          <ul className="flex gap-2 lg:block lg:space-y-1">
            {g.items.map((it) => {
              const active = path === it.href || path.startsWith(it.href + "/");
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      active
                        ? "border-rule bg-surface text-ink shadow-[inset_3px_0_0_0_var(--color-ink)]"
                        : "border-transparent text-ink-2 hover:bg-surface hover:text-ink"
                    }`}
                  >
                    <span className={`shrink-0 ${active ? "text-ink" : "text-ink-3"}`}>{it.icon}</span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[14px] font-semibold whitespace-nowrap">{it.label}</span>
                      <span className="hidden text-[12px] text-ink-3 lg:block">{it.hint}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const SVG = "size-[18px]";

function FlowIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={SVG} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="4" cy="10" r="2" />
      <circle cx="16" cy="5" r="2" />
      <circle cx="16" cy="15" r="2" />
      <path d="M6 9.2 14 5.8M6 10.8l8 3.4" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={SVG} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 8.5h15" />
    </svg>
  );
}

function PolicyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={SVG} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 2.5 16.5 5v5c0 3.4-2.6 6.2-6.5 7.5C6.1 16.2 3.5 13.4 3.5 10V5Z" />
      <path d="m7.4 9.8 1.9 1.9 3.3-3.7" strokeLinecap="round" />
    </svg>
  );
}

function LedgerIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={SVG} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.5 3.5h11v13h-11z" strokeLinejoin="round" />
      <path d="M7.5 7h5M7.5 10h5M7.5 13h3" />
    </svg>
  );
}
