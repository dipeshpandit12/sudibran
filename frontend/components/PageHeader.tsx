import type { CSSProperties, ReactNode } from "react";

/** The same opening on every page: what this is, in a sentence, and what you can do. */
export function PageHeader({ kicker, title, children, actions }: { kicker: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="intro min-w-0">
        <p className="text-[15px] font-semibold text-safe">{kicker}</p>
        <h1 className="display mt-2 text-[44px] leading-[1.04]">{title}</h1>
        {children && <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-ink-2">{children}</p>}
      </div>
      {actions && <div className="intro flex shrink-0 flex-wrap items-center gap-2" style={{ "--d": "180ms" } as CSSProperties}>{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="lift rounded-xl border border-rule bg-surface px-5 py-4">
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className="display mt-1 text-[30px] tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[13px] text-ink-2">{note}</p>}
    </div>
  );
}

export function SectionTitle({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[19px] font-bold">{title}</h2>
        {children && <p className="mt-0.5 text-[14px] text-ink-2">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

export const PAGE = "mx-auto w-full max-w-[1280px] px-6";
