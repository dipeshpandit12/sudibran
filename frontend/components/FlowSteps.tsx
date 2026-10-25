"use client";
import { useEffect, useState, type CSSProperties } from "react";

import type { NodeId } from "@/lib/types";
import { LAYER_LABEL, NODE_LAYER } from "@/lib/labels";

/*
  The same payment, on two tracks. The top track is a normal agent: nine stages,
  nothing in the way, money gone at the end. The bottom track is the same nine
  stages with Sudibran's gate on each one, and it stops where a run was stopped.
  Picking a stage opens what happens there on both tracks.
*/
type Stage = {
  node: NodeId;
  step: string;
  /** Fits under a marker on the track. */
  short: string;
  /** What an attacker writes at this stage. */
  vector: string;
  raw: string;
  guard: string;
  rules: string[];
};

const STAGES: Stage[] = [
  {
    node: "gate",
    step: "Ingest",
    short: "Ingest",
    vector: "Direct prompt injection",
    raw: "Maya's words and anything she pasted go straight into the prompt, indistinguishable from each other.",
    guard: "Her instruction is signed as intent. Pasted text is tagged untrusted and can never become an instruction.",
    rules: ["R5"],
  },
  {
    node: "invoice_reader",
    step: "Read the invoice",
    short: "Read",
    vector: "Indirect prompt injection",
    raw: "The tool returns the invoice text. A line hidden in it is now part of the agent's context.",
    guard: "Every field keeps the source it came from. Invoice text is data, never a command.",
    rules: ["IFC"],
  },
  {
    node: "parser",
    step: "Parse",
    short: "Parse",
    vector: "Wrong instruction following",
    raw: "One model reads the invoice and decides what to do about it in the same breath.",
    guard: "The parser reads untrusted text but holds no tools. It can describe, it cannot act.",
    rules: ["PRIV"],
  },
  {
    node: "planner",
    step: "Plan",
    short: "Plan",
    vector: "Unsafe data flow",
    raw: "The planner follows whatever the text asked for, including the extra step.",
    guard: "The planner acts, but never sees raw untrusted text. It works from labelled fields only.",
    rules: ["PRIV"],
  },
  {
    node: "supplier_db",
    step: "Resolve the payee",
    short: "Payee",
    vector: "Payee substitution",
    raw: "The account number is taken from the invoice, because that is where it was written.",
    guard: "The account always comes from the supplier record. A number in the text is ignored.",
    rules: ["R2", "RLS"],
  },
  {
    node: "policy",
    step: "Decide",
    short: "Decide",
    vector: "Unauthorized action",
    raw: "No policy stands between the plan and the money.",
    guard: "OPA evaluates the payment against Maya's signed intent and her limit before anything moves.",
    rules: ["R1", "INTENT"],
  },
  {
    node: "crs",
    step: "Verify the holder",
    short: "Verify",
    vector: "Mule account",
    raw: "Nobody checks who owns the destination account.",
    guard: "A new or changed account gets a CRS identity and fraud check. A flag blocks the payment.",
    rules: ["R7"],
  },
  {
    node: "broker",
    step: "Pay",
    short: "Pay",
    vector: "Credential theft",
    raw: "The agent holds a standing API key and can call the bank whenever it likes.",
    guard: "No key the agent can see. Each payment needs a one-time token tied to that approved payment.",
    rules: ["CRED"],
  },
  {
    node: "nessie",
    step: "Record",
    short: "Record",
    vector: "Covering tracks",
    raw: "Whatever happened, happened. There is no record of why.",
    guard: "Every check writes one event to a hash-chained log. If the log is down, payments stop.",
    rules: ["R8", "R4"],
  },
];

const N = STAGES.length;
/** Where stage i sits along the track, as a percentage of its width. */
const at = (i: number) => ((i + 0.5) / N) * 100;

export function FlowSteps({ active, caught }: { active?: NodeId | null; caught?: NodeId | null }) {
  const live = active ? STAGES.findIndex((s) => s.node === active) : -1;
  const stop = caught ? STAGES.findIndex((s) => s.node === caught) : -1;
  const [picked, setPicked] = useState<number | null>(null);

  // A new run takes the selection back over, so the diagram follows the run.
  useEffect(() => setPicked(null), [caught, active]);

  const sel = picked ?? (stop >= 0 ? stop : live >= 0 ? live : 0);
  const s = STAGES[sel];

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-surface">
      <div className="overflow-x-auto px-5 py-6">
        <div className="min-w-[680px]">
          <div className="grid items-center gap-x-4 gap-y-2 lg:grid-cols-[142px_minmax(0,1fr)_132px]">
            {/* Track 1: nothing in the way. */}
            <Lane label="Without Sudibran" tone="harm" />
            <div className="relative grid h-7 grid-cols-9 items-center">
              <Rail from={at(0)} to={at(N - 1)} className="bg-harm/40" />
              {STAGES.map((st, i) => (
                <Marker key={st.node} tone="harm" selected={i === sel} />
              ))}
            </div>
            <Outcome tone="harm" label="Money gone" />

            {/* The stages themselves: the one control for the whole diagram. */}
            <span className="hidden lg:block" />
            <div className="grid grid-cols-9 gap-1" role="group" aria-label="Pipeline stages">
              {STAGES.map((st, i) => {
                const on = i === sel;
                return (
                  <button
                    key={st.node}
                    onClick={() => setPicked(i)}
                    aria-pressed={on}
                    aria-label={`Stage ${i + 1}, ${st.step}`}
                    className={`rounded-lg border px-1 py-1.5 text-center transition-colors ${
                      on ? "border-ink bg-ink text-onink" : "border-transparent text-ink-2 hover:bg-sunk hover:text-ink"
                    }`}
                  >
                    <span className={`block font-mono text-[11px] ${on ? "opacity-70" : "text-ink-3"}`}>{i + 1}</span>
                    <span className="block text-[12.5px] leading-tight font-semibold">{st.short}</span>
                  </button>
                );
              })}
            </div>
            <span className="hidden lg:block" />

            {/* Track 2: a gate on every stage, and where a run was stopped. */}
            <Lane label="With Sudibran" tone="safe" />
            <div className="relative grid h-7 grid-cols-9 items-center">
              {stop >= 0 ? (
                <>
                  <Rail from={at(0)} to={at(stop)} className="bg-safe" />
                  <Rail from={at(stop)} to={at(N - 1)} className="bg-rule" dashed />
                </>
              ) : (
                <Rail from={at(0)} to={at(N - 1)} className="bg-safe/50" />
              )}
              {STAGES.map((st, i) => (
                <Gate
                  key={st.node}
                  selected={i === sel}
                  live={i === live && stop < 0}
                  stopped={i === stop}
                  spent={stop >= 0 && i > stop}
                />
              ))}
            </div>
            <Outcome tone="safe" label={stop >= 0 ? `Stopped at ${STAGES[stop].short}` : "Paid, on the record"} />
          </div>
        </div>
      </div>

      {/* What happens at the stage you picked, on each track. */}
      <div className="border-t border-rule bg-paper/40 px-5 py-5">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">
            Stage {sel + 1} of {N}
          </span>
          <span className="text-[19px] font-bold">{s.step}</span>
          <span className="font-mono text-[12px] text-ink-3">{LAYER_LABEL[NODE_LAYER[s.node]].toLowerCase().replace(/ /g, "_")}</span>
          {sel === stop && (
            <span className="rounded-full bg-safe px-2 py-0.5 text-[11.5px] font-bold text-onink">Stopped the attack here</span>
          )}
        </p>

        <div key={sel} className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="step-in rounded-lg border border-harm-line/70 bg-harm-wash/60 p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-harm">
              <CrossIcon />
              {s.vector}
            </p>
            <p className="mt-2 text-[14.5px] leading-snug text-ink-2">{s.raw}</p>
          </article>
          <article className="step-in rounded-lg border border-safe-line/70 bg-safe-wash/60 p-4">
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-safe">
                <TickIcon />
                Sudibran checks
              </span>
              <span className="flex flex-wrap gap-1">
                {s.rules.map((r) => (
                  <span key={r} className="rounded border border-safe-line/70 bg-surface px-1.5 py-px font-mono text-[11.5px] font-bold text-safe">
                    {r}
                  </span>
                ))}
              </span>
            </p>
            <p className="mt-2 text-[14.5px] leading-snug text-ink">{s.guard}</p>
          </article>
        </div>
      </div>
    </div>
  );
}

function Lane({ label, tone }: { label: string; tone: "harm" | "safe" }) {
  return (
    <span className={`text-[12.5px] font-bold ${tone === "harm" ? "text-harm" : "text-safe"} hidden lg:block`}>{label}</span>
  );
}

function Rail({ from, to, className, dashed }: { from: number; to: number; className: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${className}`}
      style={{ left: `${from}%`, width: `${to - from}%`, ...(dashed ? { maskImage: "repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 10px)", WebkitMaskImage: "repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 10px)" } : {}) }}
    />
  );
}

function Marker({ tone, selected }: { tone: "harm" | "safe"; selected: boolean }) {
  return (
    <span className="relative grid place-items-center">
      <span
        className={`rounded-full ring-4 ring-surface transition-all ${tone === "harm" ? "bg-harm" : "bg-safe"} ${
          selected ? "size-3.5" : "size-2.5 opacity-70"
        }`}
      />
    </span>
  );
}

function Gate({ selected, live, stopped, spent }: { selected: boolean; live: boolean; stopped: boolean; spent: boolean }) {
  return (
    <span className="relative grid place-items-center">
      <span
        className={`grid place-items-center rounded-[5px] ring-4 ring-surface transition-all ${
          stopped
            ? "size-6 bg-safe text-onink"
            : spent
              ? "size-2.5 border border-rule bg-surface"
              : selected
                ? "size-4 bg-safe"
                : "size-3 bg-safe/70"
        } ${live ? "pulse-ring" : ""}`}
        style={live ? ({ "--ring": "var(--color-safe)" } as CSSProperties) : undefined}
      >
        {stopped && <StopIcon />}
      </span>
    </span>
  );
}

function Outcome({ tone, label }: { tone: "harm" | "safe"; label: string }) {
  const style =
    tone === "harm" ? "border-harm-line bg-harm-wash text-harm" : "border-safe-line bg-safe-wash text-safe";
  return <span className={`hidden rounded-full border px-3 py-1 text-center text-[12.5px] font-bold lg:block ${style}`}>{label}</span>;
}

const ICON = "size-3.5 shrink-0";

function CrossIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={ICON} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={ICON} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 8.5 3.4 3.4L13 4.8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M4 8h8" />
    </svg>
  );
}
