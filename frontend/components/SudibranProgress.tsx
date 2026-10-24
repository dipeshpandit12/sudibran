"use client";
import type { AuditEvent, Decision } from "@/lib/types";
import { DECISION_LABEL, NODE_LABEL } from "@/lib/labels";
import { DECISION_STYLE } from "./ui";

const GLYPH: Record<Decision, string> = { allow: "✓", flag: "!", deny: "✕", ask: "?", hold: "‖" };

export type Finish = { label: string; tone: Decision } | null;

/**
 * Sudibran's progress through one run: a bar that fills check by check, with each
 * step's tick mark underneath it. The bank is the last stop.
 */
export function SudibranProgress({
  events,
  shown,
  done,
  finish,
  focus,
  onFocus,
}: {
  events: AuditEvent[];
  shown: number;
  done: boolean;
  finish: Finish;
  focus?: number;
  onFocus?: (i: number) => void;
}) {
  // The bank endpoint stands for the Nessie step, so it isn't drawn twice.
  const steps = events.map((e, i) => ({ e, i })).filter(({ e }) => e.node !== "nessie");
  const cols = steps.length + 1;
  const reached = steps.filter(({ i }) => i < shown).length;
  const stopped = events.slice(0, shown).some((e) => !e.off && e.decision === "deny");
  const pct = done ? (stopped || finish?.tone !== "allow" ? ((reached - 0.5) / cols) * 100 : 100) : reached === 0 ? 0 : ((reached - 0.5) / cols) * 100;
  const barColor = stopped ? DECISION_STYLE.deny.fg : events.slice(0, shown).some((e) => e.decision === "ask") ? DECISION_STYLE.ask.fg : DECISION_STYLE.allow.fg;

  const status = !events.length
    ? "Waiting for the next invoice"
    : !done
      ? `Checking step ${Math.max(1, shown)} of ${events.length}`
      : stopped
        ? "Stopped before any money moved"
        : finish?.tone === "allow"
          ? "All checks passed"
          : finish?.label ?? "Finished";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden>
            <path d="M8 0 15 3v5.2c0 4.3-3 7.6-7 8.8C4 15.8 1 12.5 1 8.2V3l7-3Z" fill="var(--color-ink)" />
          </svg>
          Sudibran
          <span className="font-normal text-ink-2">· {status}</span>
        </p>
        {done && stopped ? (
          <p className="text-[14px] font-bold text-harm">Stopped at step {events.findIndex((e) => !e.off && e.decision === "deny") + 1}</p>
        ) : done && finish && finish.tone !== "allow" ? null : (
          <p className="wide text-[14px] font-bold tabular-nums" aria-hidden>
            {Math.round(done ? 100 : (reached / cols) * 100)}%
          </p>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Sudibran checks"
        aria-valuemin={0}
        aria-valuemax={events.length}
        aria-valuenow={shown}
        className="relative h-2.5 overflow-hidden rounded-full bg-sunk"
      >
        <div className="h-full rounded-full transition-[width,background-color] duration-700 ease-out" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      <ol className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {steps.map(({ e, i }) => {
          const reachedStep = i < shown;
          const current = !done && i === shown - 1;
          const s = DECISION_STYLE[e.decision];
          return (
            <li key={e.seq} className="flex min-w-0 flex-col items-center text-center">
              <button
                type="button"
                disabled={!reachedStep || !onFocus}
                onClick={() => onFocus?.(i)}
                aria-label={`Step ${i + 1}: ${NODE_LABEL[e.node]}${reachedStep ? `, ${e.off ? "check off" : DECISION_LABEL[e.decision]}` : ", not reached yet"}`}
                className="flex flex-col items-center gap-1 disabled:cursor-default"
              >
                <span
                  className={`grid size-8 place-items-center rounded-full text-[15px] font-bold transition-colors ${current ? "pulse-ring" : ""}`}
                  style={
                    reachedStep
                      ? {
                          background: e.off ? "var(--color-surface)" : s.fg,
                          color: e.off ? "var(--color-ink-2)" : "#fff",
                          border: e.off ? "2px dashed var(--color-ink-3)" : undefined,
                          boxShadow: focus === i ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${s.fg}` : undefined,
                          ["--ring" as string]: s.fg,
                        }
                      : { border: "2px solid var(--color-rule)", color: "var(--color-ink-3)", background: "var(--color-surface)" }
                  }
                >
                  {reachedStep ? (e.off ? "–" : GLYPH[e.decision]) : i + 1}
                </span>
                <span className={`w-full truncate px-0.5 text-[12px] font-semibold leading-tight ${reachedStep ? "text-ink" : "text-ink-3"}`}>
                  {NODE_LABEL[e.node]}
                </span>
              </button>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-col items-center gap-1 text-center">
          <span
            className="grid size-8 place-items-center rounded-lg text-[15px] font-bold"
            style={
              done && finish
                ? { background: DECISION_STYLE[finish.tone].bg, color: DECISION_STYLE[finish.tone].fg, border: `2px solid ${DECISION_STYLE[finish.tone].fg}` }
                : { border: "2px dashed var(--color-rule)", color: "var(--color-ink-3)" }
            }
          >
            $
          </span>
          <span className="w-full truncate text-[12px] font-semibold leading-tight" style={{ color: done && finish ? DECISION_STYLE[finish.tone].fg : "var(--color-ink-3)" }}>
            {done && finish ? finish.label : "Bank"}
          </span>
        </li>
      </ol>
    </div>
  );
}
