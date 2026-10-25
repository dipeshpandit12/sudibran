import type { AuditEvent, Chapter, Decision, Layer, NodeId, RunResult } from "@/lib/types";
import { LAYER_LABEL, NODE_LABEL, RULE_LABEL } from "@/lib/labels";
import type { EndState } from "@/components/Fig4Map";
import type { Finish } from "@/components/SudibranProgress";
import chaptersJson from "@/data/experiment.json";

export const CHAPTERS = chaptersJson as Chapter[];
export const THREATS = CHAPTERS.filter((c) => c.kind === "threat");
export const BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
export const STEP_MS = 900;
export const DEFAULT_PRESET = "side_by_side_140";

export const LAYER_OF: Record<string, Layer> = {
  side_by_side_140: "workflow",
  A1: "user_interface",
  A2: "llm",
  A3: "workflow",
  A4: "memory",
  A5: "other_agents",
  A6: "tool",
  A7: "external_data",
  A8: "private_data",
  A9: "payment",
  custom: "workflow",
};

export const TARGET: Record<Layer, NodeId> = {
  user_interface: "gate",
  llm: "parser",
  workflow: "planner",
  memory: "memory",
  other_agents: "seller",
  tool: "proxy",
  external_data: "invoice_reader",
  private_data: "supplier_db",
  payment: "nessie",
};

export function finishOf(run: RunResult | null, done: boolean): { end: EndState; finish: Finish } {
  if (!run || !done) return { end: null, finish: null };
  const st = run.protected.result.payment_status;
  if (st === "paid") return { end: { text: "Paid", tone: "allow" }, finish: { label: "Paid", tone: "allow" } };
  if (st === "awaiting_maya") return { end: { text: "Waits for Maya", tone: "ask" }, finish: { label: "Waits for Maya", tone: "ask" } };
  if (st === "on_hold") return { end: { text: "On hold", tone: "hold" }, finish: { label: "On hold", tone: "hold" } };
  if (run.protected.rule === "INTENT") return { end: null, finish: { label: "Held for review", tone: "ask" } };
  if (run.raw.harm.type === "data") return { end: null, finish: { label: "Nothing left", tone: "deny" } };
  return { end: { text: "No money moved", tone: "deny" }, finish: { label: "Not reached", tone: "deny" } };
}

export function decisiveIndex(events: AuditEvent[]) {
  const i = events.findIndex((e) => !e.off && (e.decision === "deny" || e.decision === "ask" || e.decision === "hold"));
  return i >= 0 ? i : events.length - 1;
}

export type Verdict = { tone: Decision; code: string; title: string; detail: string; layer: string; check: string; rule: string };

export function verdictOf(run: RunResult): Verdict {
  const p = run.protected;
  const ev = p.events[decisiveIndex(p.events)];
  const layer = ev ? LAYER_LABEL[ev.layer] : "—";
  const check = p.caught_at ? NODE_LABEL[p.caught_at] : "—";
  const rule = p.rule ?? "—";
  const st = p.result.payment_status;
  if (p.model_resisted) return { tone: "allow", code: "PASSED", title: "The model refused on its own this time", detail: p.result.summary, layer, check, rule };
  if (st === "on_hold") return { tone: "hold", code: "ON_HOLD", title: "On hold: the audit log is down", detail: p.result.summary, layer, check, rule };
  if (p.rule === "INTENT")
    return { tone: "ask", code: "NEEDS_REVIEW", title: "Needs review: not covered by Maya's policies", detail: ev?.reason ?? p.result.summary, layer, check, rule };
  if (st === "awaiting_maya") return { tone: "ask", code: "NEEDS_APPROVAL", title: "Needs Maya's approval", detail: ev?.reason ?? p.result.summary, layer, check, rule };
  if (st === "paid") return { tone: "allow", code: "SANITISED", title: "Injection removed. The real invoice was paid safely", detail: p.result.summary, layer, check, rule };
  return {
    tone: "deny",
    code: "BLOCKED",
    title: `Blocked by the ${layer} layer`,
    detail: `${check}${p.rule ? ` · ${RULE_LABEL[p.rule] ?? p.rule}` : ""}. ${ev?.reason ?? ""}`,
    layer,
    check,
    rule,
  };
}

export const VERDICT_STYLE: Record<Decision, { box: string; head: string; badge: string }> = {
  deny: { box: "border-harm bg-harm-wash", head: "text-harm", badge: "bg-harm text-white" },
  ask: { box: "border-ask-line bg-ask-wash", head: "text-ask", badge: "bg-ask text-white" },
  hold: { box: "border-hold-line bg-hold-wash", head: "text-hold", badge: "bg-hold text-white" },
  allow: { box: "border-safe-line bg-safe-wash", head: "text-safe", badge: "bg-safe text-white" },
  flag: { box: "border-flag bg-flag-wash", head: "text-flag", badge: "bg-flag text-white" },
};
