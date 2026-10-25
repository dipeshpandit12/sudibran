import type { ReactNode } from "react";
import type { Decision, PaymentStatus } from "@/lib/types";
import { DECISION_LABEL } from "@/lib/labels";

export const DECISION_STYLE: Record<Decision, { fg: string; bg: string; line: string }> = {
  allow: { fg: "#000000", bg: "#f3f4f6", line: "#d1d5db" },
  flag: { fg: "#1f2937", bg: "#f9fafb", line: "#d1d5db" },
  deny: { fg: "#000000", bg: "#f3f4f6", line: "#9ca3af" },
  ask: { fg: "#111827", bg: "#f9fafb", line: "#d1d5db" },
  hold: { fg: "#374151", bg: "#f9fafb", line: "#e5e7eb" },
};

export function DecisionChip({ decision, off }: { decision: Decision; off?: boolean }) {
  if (off) {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-dashed border-neutral-300 bg-neutral-50 px-2 py-0.5 text-xs font-mono text-neutral-500">
        Check off
      </span>
    );
  }
  const s = DECISION_STYLE[decision];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-mono font-medium"
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.line }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: s.fg }} />
      {DECISION_LABEL[decision]}
    </span>
  );
}

const PAY: Record<PaymentStatus, { label: string; d: Decision }> = {
  paid: { label: "Paid", d: "allow" },
  blocked: { label: "Blocked", d: "deny" },
  awaiting_maya: { label: "Awaiting Maya", d: "ask" },
  on_hold: { label: "On hold", d: "hold" },
};

export function PaymentChip({ status }: { status: PaymentStatus }) {
  const p = PAY[status];
  const s = DECISION_STYLE[p.d];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-mono font-medium"
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.line }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: s.fg }} />
      {p.label}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "flag" | "safe" | "harm";
}) {
  const map = {
    neutral: "bg-neutral-100 text-neutral-800 border-neutral-200",
    flag: "bg-neutral-100 text-neutral-900 border-neutral-300",
    safe: "bg-neutral-100 text-black border-neutral-300",
    harm: "bg-neutral-100 text-black border-neutral-300",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-mono font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
  className = "",
  pressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "safe";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  pressed?: boolean;
}) {
  const styles = {
    primary:
      "bg-black hover:bg-neutral-800 text-white font-medium border border-black",
    ghost:
      "bg-white text-neutral-900 hover:bg-neutral-100 border border-neutral-300",
    danger:
      "bg-white text-black hover:bg-neutral-100 border border-neutral-300 font-medium",
    safe:
      "bg-white text-black hover:bg-neutral-100 border border-neutral-300 font-medium",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Banner({ tone, title, children }: { tone: "ask" | "hold"; title: string; children?: ReactNode }) {
  void tone;
  return (
    <div role="status" className="flex items-baseline gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-2.5 text-sm text-neutral-900">
      <span className="size-2 rounded-full bg-black" />
      <strong className="font-semibold text-black">{title}</strong>
      {children && <span className="text-neutral-600">{children}</span>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-white transition-colors ${className}`}
    >
      {children}
    </section>
  );
}
