"use client";
import type { AuditEvent } from "@/lib/types";
import { LAYER_LABEL, NODE_LABEL } from "@/lib/labels";
import { DecisionChip } from "./ui";

/** What happens after this step, in plain words. */
export function nextMove(events: AuditEvent[], i: number): string {
  const e = events[i];
  const next = events.slice(i + 1).find((n) => n.node !== e.node);
  const to = next ? (next.node === "nessie" ? "the bank" : NODE_LABEL[next.node]) : "the bank";
  if (e.off) return `This check is switched off, so the request passes straight to ${to}.`;
  switch (e.decision) {
    case "allow":
      return next ? `Allowed. Moves on to ${to}.` : "Allowed. The payment goes through.";
    case "flag":
      return `Marked untrusted, then moves on to ${to}. Untrusted data can never choose who gets paid.`;
    case "deny":
      return next ? `Blocked here. The payment never reaches the bank; ${to} still records evidence.` : "Blocked here. The payment never reaches the bank.";
    case "ask":
      return e.rule === "INTENT"
        ? "Held for review. Nothing runs, because no policy allows this action and Maya never asked for it."
        : "Paused. Maya decides on an approval card drawn by Sudibran.";
    case "hold":
      return "Paused until the audit log can record it again.";
  }
}

export function DecisionPanel({
  events,
  shown,
  done,
  focus,
  onFocus,
  onReplay,
  onSkip,
}: {
  events: AuditEvent[];
  shown: number;
  done: boolean;
  focus: number;
  onFocus: (i: number) => void;
  onReplay: () => void;
  onSkip: () => void;
}) {
  const e = events.slice(0, shown)[focus];
  return (
    <div className="flex h-full flex-col rounded-xl border border-rule bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <p className="text-[13px] font-semibold text-ink-2">{e ? `Step ${focus + 1} of ${events.length}` : "Starting…"}</p>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous step"
            disabled={focus <= 0}
            onClick={() => onFocus(focus - 1)}
            className="grid size-8 place-items-center rounded-lg border border-rule text-[17px] font-bold hover:bg-sunk disabled:opacity-40"
          >
            ‹
          </button>
          <button
            aria-label="Next step"
            disabled={focus >= shown - 1}
            onClick={() => onFocus(focus + 1)}
            className="grid size-8 place-items-center rounded-lg border border-rule text-[17px] font-bold hover:bg-sunk disabled:opacity-40"
          >
            ›
          </button>
          <button onClick={done ? onReplay : onSkip} className="ml-1 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink">
            {done ? "Replay" : "Skip"}
          </button>
        </div>
      </div>
      {e ? (
        <div key={e.seq} className="step-in flex flex-1 flex-col gap-4 px-5 py-4">
          <div>
            <p className="text-[12.5px] text-ink-2">{LAYER_LABEL[e.layer]} layer · {e.mechanism.replace(/_/g, " ")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h4 className="display text-[26px]">{NODE_LABEL[e.node]}</h4>
              <DecisionChip decision={e.decision} off={e.off} />
            </div>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-2">What Sudibran detected</p>
            <p className="mt-0.5 text-[17px] leading-snug">{e.reason}</p>
          </div>
          <div className="mt-auto rounded-lg bg-paper px-4 py-3">
            <p className="text-[12.5px] font-semibold text-ink-2">Decision</p>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug">{nextMove(events, focus)}</p>
          </div>
        </div>
      ) : (
        <p className="px-5 py-4 text-ink-2">The first check is starting.</p>
      )}
    </div>
  );
}
