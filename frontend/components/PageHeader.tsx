import type { ReactNode } from "react";

/** Standard human layout header on every page */
export function PageHeader({
  kicker,
  title,
  children,
  actions,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-2 border-b border-neutral-200 pb-6 mb-6">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 rounded border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-mono font-medium text-neutral-800 mb-2">
          <span>{kicker}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-black">
          {title}
        </h1>
        {children && (
          <p className="mt-2 max-w-[70ch] text-base leading-relaxed text-neutral-600">
            {children}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-400">
      <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-black tabular-nums">{value}</p>
      {note && <div className="mt-1.5 text-xs text-neutral-500 font-mono">{note}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-black tracking-tight flex items-center gap-2">
          <span>{title}</span>
        </h2>
        {children && <p className="mt-0.5 text-sm text-neutral-600">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

export const PAGE = "mx-auto w-full max-w-[1280px] px-6";
