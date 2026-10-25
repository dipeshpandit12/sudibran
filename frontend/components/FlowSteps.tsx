"use client";
import type { CSSProperties } from "react";

import type { NodeId } from "@/lib/types";
import { LAYER_LABEL, NODE_LAYER } from "@/lib/labels";

/*
  The same payment, twice. Each stage is one rung of a spine: on the left what a
  normal agent does there and the attack that exploits it, on the right the check
  Sudibran puts in its place and the rule it comes from. During a run the stage
  being checked lights up, and the one that stops the attack is marked.
*/
type Stage = {
  node: NodeId;
  step: string;
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
    vector: "Direct prompt injection",
    raw: "Maya's words and anything she pasted go straight into the prompt, indistinguishable from each other.",
    guard: "Her instruction is signed as intent. Pasted text is tagged untrusted and can never become an instruction.",
    rules: ["R5"],
  },
  {
    node: "invoice_reader",
    step: "Read the invoice",
    vector: "Indirect prompt injection",
    raw: "The tool returns the invoice text. A line hidden in it is now part of the agent's context.",
    guard: "Every field keeps the source it came from. Invoice text is data, never a command.",
    rules: ["IFC"],
  },
  {
    node: "parser",
    step: "Parse",
    vector: "Wrong instruction following",
    raw: "One model reads the invoice and decides what to do about it in the same breath.",
    guard: "The parser reads untrusted text but holds no tools. It can describe, it cannot act.",
    rules: ["PRIV"],
  },
  {
    node: "planner",
    step: "Plan",
    vector: "Unsafe data flow",
    raw: "The planner follows whatever the text asked for, including the extra step.",
    guard: "The planner acts, but never sees raw untrusted text. It works from labelled fields only.",
    rules: ["PRIV"],
  },
  {
    node: "supplier_db",
    step: "Resolve the payee",
    vector: "Payee substitution",
    raw: "The account number is taken from the invoice, because that is where it was written.",
    guard: "The account always comes from the supplier record. A number in the text is ignored.",
    rules: ["R2", "RLS"],
  },
  {
    node: "policy",
    step: "Decide",
    vector: "Unauthorized action",
    raw: "No policy stands between the plan and the money.",
    guard: "OPA evaluates the payment against Maya's signed intent and her limit before anything moves.",
    rules: ["R1", "INTENT"],
  },
  {
    node: "crs",
    step: "Verify the holder",
    vector: "Mule account",
    raw: "Nobody checks who owns the destination account.",
    guard: "A new or changed account gets a CRS identity and fraud check. A flag blocks the payment.",
    rules: ["R7"],
  },
  {
    node: "broker",
    step: "Pay",
    vector: "Credential theft",
    raw: "The agent holds a standing API key and can call the bank whenever it likes.",
    guard: "No key the agent can see. Each payment needs a one-time token tied to that approved payment.",
    rules: ["CRED"],
  },
  {
    node: "nessie",
    step: "Record",
    vector: "Covering tracks",
    raw: "Whatever happened, happened. There is no record of why.",
    guard: "Every check writes one event to a hash-chained log. If the log is down, payments stop.",
    rules: ["R8", "R4"],
  },
];

export function FlowSteps({ active, caught }: { active?: NodeId | null; caught?: NodeId | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-surface">
      <Legend />

      <ol className="relative">
        {/* The spine the stage markers sit on. */}
        <span aria-hidden className="pointer-events-none absolute top-6 bottom-6 left-[35px] w-px bg-rule" />

        {STAGES.map((s, i) => {
          const live = active === s.node && caught !== s.node;
          const stopped = caught === s.node;
          return (
            <li
              key={s.node}
              className={`relative grid gap-x-5 gap-y-3 border-b border-rule px-5 py-5 transition-colors last:border-0 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)] ${
                stopped ? "bg-safe-wash/50" : live ? "bg-sunk/60" : ""
              }`}
            >
              {/* Rail: where we are in the run. */}
              <div className="flex items-center gap-3 lg:items-start">
                <span
                  className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 font-mono text-[13px] font-bold transition-colors ${
                    stopped
                      ? "border-safe bg-safe text-onink"
                      : live
                        ? "border-ink bg-ink text-onink pulse-ring"
                        : "border-rule bg-surface text-ink-3"
                  }`}
                  style={live ? ({ "--ring": "var(--color-ink)" } as CSSProperties) : undefined}
                >
                  {stopped ? <StopIcon /> : i + 1}
                </span>
                <span className="min-w-0 lg:pt-0.5">
                  <span className="block text-[15px] leading-tight font-bold">{s.step}</span>
                  <span className="block font-mono text-[11.5px] leading-tight text-ink-3">
                    {LAYER_LABEL[NODE_LAYER[s.node]].toLowerCase().replace(/ /g, "_")}
                  </span>
                </span>
              </div>

              {/* Lane 1: what happens without a trust layer. */}
              <div className="rounded-lg border border-harm-line/70 bg-harm-wash/60 p-3.5 lg:ml-0 ml-11">
                <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.01em] text-harm">
                  <CrossIcon />
                  {s.vector}
                </p>
                <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{s.raw}</p>
              </div>

              {/* Lane 2: the check, and the rule it comes from. */}
              <div className="rounded-lg border border-safe-line/70 bg-safe-wash/60 p-3.5 lg:ml-0 ml-11">
                <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-safe">
                    <TickIcon />
                    {stopped ? "Stopped the attack here" : "Sudibran checks"}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {s.rules.map((r) => (
                      <span key={r} className="rounded border border-safe-line/70 bg-surface px-1.5 py-px font-mono text-[11.5px] font-bold text-safe">
                        {r}
                      </span>
                    ))}
                  </span>
                </p>
                <p className="mt-1.5 text-[14px] leading-snug text-ink">{s.guard}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-paper/50 px-5 py-3">
      <span className="text-[11.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">Nine stages, two agents</span>
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-harm">
        <span className="size-2.5 rounded-sm bg-harm-wash ring-1 ring-harm-line" />
        What an attacker gets without Sudibran
      </span>
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-safe">
        <span className="size-2.5 rounded-sm bg-safe-wash ring-1 ring-safe-line" />
        The check in its place, and its rule
      </span>
    </div>
  );
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
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M4 8h8" />
    </svg>
  );
}
