import type { ReactNode } from "react";
import type { Decision, PaymentStatus } from "@/lib/types";
import { DECISION_LABEL } from "@/lib/labels";

export const DECISION_STYLE: Record<Decision, { fg: string; bg: string; line: string }> = {
  allow: { fg: "var(--color-safe)", bg: "var(--color-safe-wash)", line: "var(--color-safe)" },
  flag: { fg: "var(--color-flag)", bg: "var(--color-flag-wash)", line: "var(--color-flag)" },
  deny: { fg: "var(--color-harm)", bg: "var(--color-harm-wash)", line: "var(--color-harm)" },
  ask: { fg: "var(--color-ask)", bg: "var(--color-ask-wash)", line: "var(--color-ask-line)" },
  hold: { fg: "var(--color-hold)", bg: "var(--color-hold-wash)", line: "var(--color-hold)" },
};

export function DecisionChip({ decision, off }: { decision: Decision; off?: boolean }) {
  if (off) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-ink-3 px-2 py-0.5 text-[12px] font-medium text-ink-2">
        Check off
      </span>
    );
  }
  const s = DECISION_STYLE[decision];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{ color: s.fg, background: s.bg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: s.fg }} />
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
    <span className="inline-flex shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: s.fg, background: s.bg }}>
      {p.label}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "flag" | "safe" | "harm" }) {
  const map = {
    neutral: "bg-sunk text-ink-2",
    flag: "bg-flag-wash text-flag",
    safe: "bg-safe-wash text-safe",
    harm: "bg-harm-wash text-harm",
  };
  return <span className={`inline-flex shrink-0 rounded px-1.5 py-px text-[11.5px] font-semibold ${map[tone]}`}>{children}</span>;
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
    primary: "bg-ink text-onink hover:bg-ink/90 border-ink",
    ghost: "bg-surface text-ink hover:bg-sunk border-rule",
    danger: "bg-surface text-harm hover:bg-harm-wash border-harm-line",
    safe: "bg-safe text-onink hover:bg-safe/90 border-safe",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Banner({ tone, title, children }: { tone: "ask" | "hold"; title: string; children?: ReactNode }) {
  const s = tone === "ask" ? "bg-ask-wash border-ask-line text-ask" : "bg-hold-wash border-hold-line text-hold";
  return (
    <div role="status" className={`flex items-baseline gap-3 border-b px-6 py-2 text-[14px] ${s}`}>
      <strong className="font-semibold">{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-rule bg-surface ${className}`}>{children}</section>;
}
