"use client";
import type { NodeId } from "@/lib/types";
import { LAYER_LABEL, NODE_LAYER } from "@/lib/labels";

/*
  The same payment, twice. The left lane is what a normal agent does at each
  stage; the right lane is what Sudibran inserts there and which rule it comes
  from. During a run the stage being checked lights up.
*/
type Stage = {
  node: NodeId;
  step: string;
  raw: string;
  guard: string;
  rules: string[];
};

const STAGES: Stage[] = [
  {
    node: "gate",
    step: "Ingest",
    raw: "Maya's words and anything she pasted go straight into the prompt, indistinguishable from each other.",
    guard: "Her instruction is signed as intent. Pasted text is tagged untrusted and can never become an instruction.",
    rules: ["R5"],
  },
  {
    node: "invoice_reader",
    step: "Read the invoice",
    raw: "The tool returns the invoice text. A line hidden in it is now part of the agent's context.",
    guard: "Every field keeps the source it came from. Invoice text is data, never a command.",
    rules: ["IFC"],
  },
  {
    node: "parser",
    step: "Parse",
    raw: "One model reads the invoice and decides what to do about it in the same breath.",
    guard: "The parser reads untrusted text but holds no tools. It can describe, it cannot act.",
    rules: ["PRIV"],
  },
  {
    node: "planner",
    step: "Plan",
    raw: "The planner follows whatever the text asked for, including the extra step.",
    guard: "The planner acts, but never sees raw untrusted text. It works from labelled fields only.",
    rules: ["PRIV"],
  },
  {
    node: "supplier_db",
    step: "Resolve the payee",
    raw: "The account number is taken from the invoice, because that is where it was written.",
    guard: "The account always comes from the supplier record. A number in the text is ignored.",
    rules: ["R2", "RLS"],
  },
  {
    node: "policy",
    step: "Decide",
    raw: "No policy stands between the plan and the money.",
    guard: "OPA evaluates the payment against Maya's signed intent and her limit before anything moves.",
    rules: ["R1", "INTENT"],
  },
  {
    node: "crs",
    step: "Verify the holder",
    raw: "Nobody checks who owns the destination account.",
    guard: "A new or changed account gets a CRS identity and fraud check. A flag blocks the payment.",
    rules: ["R7"],
  },
  {
    node: "broker",
    step: "Pay",
    raw: "The agent holds a standing API key and can call the bank whenever it likes.",
    guard: "No key the agent can see. Each payment needs a one-time token tied to that approved payment.",
    rules: ["CRED"],
  },
  {
    node: "nessie",
    step: "Record",
    raw: "Whatever happened, happened. There is no record of why.",
    guard: "Every check writes one event to a hash-chained log. If the log is down, payments stop.",
    rules: ["R8", "R4"],
  },
];

export function FlowSteps({ active, caught }: { active?: NodeId | null; caught?: NodeId | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-surface">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border-b border-rule px-5 py-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        <span className="w-16 text-[11.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">Stage</span>
        <span className="text-[11.5px] font-bold tracking-[0.08em] text-harm uppercase">Without Sudibran</span>
        <span className="hidden text-[11.5px] font-bold tracking-[0.08em] text-safe uppercase md:block">With Sudibran</span>
      </div>

      <ol>
        {STAGES.map((s, i) => {
          const live = active === s.node;
          const stopped = caught === s.node;
          return (
            <li
              key={s.node}
              className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-rule px-5 py-4 transition-colors last:border-0 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] ${
                stopped ? "bg-harm-wash" : live ? "bg-sunk" : ""
              }`}
            >
              <div className="row-span-2 w-16 md:row-span-1">
                <span
                  className={`grid size-8 place-items-center rounded-lg font-mono text-[13px] font-bold ${
                    stopped ? "bg-harm text-onink" : live ? "bg-ink text-onink" : "bg-sunk text-ink-2"
                  } ${live && !stopped ? "pulse-ring" : ""}`}
                  style={live && !stopped ? ({ "--ring": "var(--color-ink)" } as React.CSSProperties) : undefined}
                >
                  {i + 1}
                </span>
                <p className="mt-2 text-[13px] leading-tight font-bold">{s.step}</p>
                <p className="font-mono text-[11px] leading-tight text-ink-3">{LAYER_LABEL[NODE_LAYER[s.node]].toLowerCase().replace(/ /g, "_")}</p>
              </div>

              <p className="text-[14px] leading-snug text-ink-2">{s.raw}</p>

              <div className="border-l-2 border-safe-line pl-3 md:border-l-2">
                <p className="text-[14px] leading-snug text-ink">{s.guard}</p>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {s.rules.map((r) => (
                    <span key={r} className="rounded bg-safe-wash px-1.5 py-px font-mono text-[11.5px] font-semibold text-safe">
                      {r}
                    </span>
                  ))}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
