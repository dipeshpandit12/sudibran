import "server-only";
import { createHash } from "node:crypto";

import seed from "@/data/seed.json";
import checksJson from "@/data/checks.json";
import { SCENARIOS } from "./scenarios";
import { canonical, GENESIS } from "./chain";
import { NODE_LABEL, usd } from "./labels";
import type {
  Approval,
  AuditEvent,
  ChatMessage,
  Check,
  DemoState,
  DemoSwitches,
  EvidenceReport,
  Intent,
  NodeId,
  Payment,
  ProtectedResult,
  RunResult,
  ScenarioEvent,
} from "./types";

export const CHECKS = checksJson as Check[];

interface Internal extends Omit<DemoState, "audit_length"> {
  audit: AuditEvent[];
  seller_strikes: number;
  counter: number;
}

const ACTOR: Record<NodeId, string> = {
  maya: "maya",
  gate: "sudibran-gate",
  seller: "agent-acme-seller",
  planner: "model-planner",
  parser: "model-parser",
  memory: "sudibran-memory-gate",
  policy: "sudibran-policy",
  broker: "sudibran-broker",
  crs: "svc-crs",
  nessie: "tool-payment",
  proxy: "sudibran-mcp-proxy",
  invoice_reader: "tool-invoice-reader",
  supplier_db: "tool-supplier-db",
};

function fresh(): Internal {
  const s = structuredClone(seed);
  return {
    intent: s.intent as Intent,
    suppliers: s.suppliers as Internal["suppliers"],
    components: s.components as Internal["components"],
    balances: s.balances,
    invoices: [],
    payments: [],
    approvals: [],
    chat: s.chat as ChatMessage[],
    switches: { assume_breach: true, layer_off: null, audit_down: false },
    score: { fired: 0, harmed: 0, blocked: 0 },
    runs: [],
    audit: [],
    seller_strikes: 0,
    counter: 0,
  };
}

// Survive dev-server hot reloads; a real restart or Reset returns to seed.json.
const g = globalThis as unknown as { __sudibran?: Internal };
function db(): Internal {
  if (!g.__sudibran) g.__sudibran = fresh();
  return g.__sudibran;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

function labelsFor(e: ScenarioEvent): string[] {
  const labels: string[] = [];
  if (/untrusted|unverified|text|hidden|pasted/i.test(e.reason) || e.layer === "external_data" || e.layer === "other_agents") {
    labels.push("untrusted");
  }
  if (e.layer === "private_data" || /masked|supplier record|row-level/i.test(e.reason)) labels.push("private");
  if (e.layer === "payment") labels.push("payment");
  if (e.mechanism === "assume_breach") labels.push("assume_breach");
  return labels;
}

function append(runId: string, events: ScenarioEvent[], paymentId: string | null): AuditEvent[] {
  const s = db();
  const threshold = s.intent.threshold_usd;
  const stamped: AuditEvent[] = [];
  events.forEach((e, i) => {
    const prev = s.audit[s.audit.length - 1];
    const base: Omit<AuditEvent, "hash"> = {
      ...e,
      reason: e.reason.replace(/\$500 threshold/g, `${usd(threshold).replace(".00", "")} threshold`),
      seq: s.audit.length + 1,
      time: now(),
      run_id: runId,
      step: i + 1,
      actor: ACTOR[e.node],
      labels: labelsFor(e),
      payment_id: paymentId,
      prev_hash: prev ? prev.hash : GENESIS,
    };
    const ev: AuditEvent = { ...base, hash: sha256(canonical(base)) };
    s.audit.push(ev);
    stamped.push(ev);
  });
  return stamped;
}

function say(from: ChatMessage["from"], text: string, untrusted = false) {
  const s = db();
  s.chat.push({ id: `m-${s.chat.length + 1}-${Date.now()}`, from, text, untrusted, time: now() });
}

function matchesCheck(e: ScenarioEvent, c: Check) {
  return e.node === c.node && (!c.rule || e.rule === c.rule) && e.decision !== "allow";
}

// ───────────────────────── public API ─────────────────────────

export function getState(): DemoState {
  const { audit, seller_strikes, counter, ...rest } = db();
  void seller_strikes;
  void counter;
  return structuredClone({ ...rest, audit_length: audit.length });
}

export function reset(): DemoState {
  g.__sudibran = fresh();
  return getState();
}

export function setSwitches(patch: Partial<DemoSwitches>): DemoSwitches {
  const s = db();
  s.switches = { ...s.switches, ...patch };
  if (s.switches.layer_off && !CHECKS.some((c) => c.key === s.switches.layer_off)) s.switches.layer_off = null;
  return { ...s.switches };
}

export function saveIntent(text: string, threshold: number): Intent {
  const s = db();
  s.intent = { ...s.intent, text, threshold_usd: threshold, signed: true, created_at: now() };
  say("sudibran", `Intent ${s.intent.id} updated and signed. Threshold: ${usd(threshold)}.`);
  return { ...s.intent };
}

export function postChat(text: string, pasted: boolean): ChatMessage[] {
  say("maya", text, pasted);
  if (pasted) {
    say("sudibran", "Pasted text is tagged untrusted. It can inform the agent, but it can't change your intent or approve a payment.");
    say("agent", "I've read the pasted email. I'll only act on it through the normal checks.");
  } else {
    say("agent", "Noted. Anything that moves money still goes through Sudibran first.");
  }
  return structuredClone(db().chat);
}

export function hasScenario(id: string) {
  return id in SCENARIOS;
}

export function run(id: string, opts: { injection?: string } = {}): RunResult {
  const s = db();
  const sc = SCENARIOS[id];
  const sw = { ...s.switches };
  s.counter += 1;
  const runId = `run-${String(s.counter).padStart(3, "0")}-${id}`;

  let events: ScenarioEvent[] = structuredClone(sc.protected.events);
  let caughtAt: NodeId | null = sc.protected.caught_at;
  let rule: string | null = sc.protected.rule;
  let result: ProtectedResult = { ...sc.protected.result };
  let rawSteps = [...sc.raw.steps];
  let harm = { ...sc.raw.harm };
  let rawChange = sc.raw.balance_change_usd;
  let viaLayerOff = false;
  let note: string | null = null;

  // Assume breach OFF: the model may resist on its own. Shown honestly on both sides.
  const breachIdx = events.findIndex((e) => e.mechanism === "assume_breach");
  const modelResisted = sc.kind === "attack" && !sw.assume_breach && breachIdx >= 0;
  if (modelResisted) {
    events = [
      ...events.slice(0, breachIdx),
      { ...events[breachIdx], decision: "allow", reason: "Planner refused the injected instruction on its own" },
    ];
    caughtAt = "planner";
    rule = null;
    result = {
      payment_status: "none",
      balance_change_usd: 0,
      alert_maya: false,
      summary: "The model resisted this time. Sudibran doesn't count on that, so switch assume breach on to see a fully fooled model.",
    };
    rawSteps = [rawSteps[0], "The model spotted the injection and refused, this time", "Nothing moved, but only because the model got lucky"];
    harm = { type: "none", amount_usd: 0, detail: "Model resisted" };
    rawChange = 0;
  } else if (sw.layer_off) {
    const check = CHECKS.find((c) => c.key === sw.layer_off)!;
    const idx = events.findIndex((e) => matchesCheck(e, check));
    if (idx >= 0) {
      const marker: ScenarioEvent = { ...events[idx], decision: "allow", off: true, reason: `Check switched off: ${check.label}` };
      delete marker.rule;
      const ending = sc.protected.layer_off?.[check.key];
      if (ending) {
        events = [...events.slice(0, idx), marker, ...structuredClone(ending.events_tail)];
        caughtAt = ending.caught_at;
        rule = ending.rule;
        result = {
          ...result,
          ...ending.result,
          summary: ending.result?.summary ?? `With “${check.label}” off, ${NODE_LABEL[ending.caught_at]} stopped it instead.`,
        };
      } else {
        events[idx] = marker;
        note = "That check was off. The later checks on this path still held.";
      }
      viaLayerOff = true;
    } else {
      note = `“${check.label}” isn't on this attack's path, so switching it off changes nothing here.`;
    }
  }

  // R4: no audit log, no payment.
  if (sw.audit_down && (result.payment_status === "paid" || result.payment_status === "awaiting_maya")) {
    const cut = events.findIndex((e) => e.node === "broker" || e.node === "nessie" || e.node === "maya");
    if (cut >= 0) events = events.slice(0, cut);
    events.push({
      node: "broker",
      edge: ["policy", "broker"],
      layer: "payment",
      mechanism: "monitoring",
      decision: "hold",
      reason: "R4: the audit log can't be written, so the payment is on hold",
      rule: "R4",
    });
    caughtAt = "broker";
    rule = "R4";
    result = { ...result, payment_status: "on_hold", balance_change_usd: 0, summary: "Audit log is down. The payment is paused until it's back (R4)." };
  }

  // Records Maya sees in her app
  const paymentId = sc.payment && result.payment_status !== "none" ? `pay-${String(s.counter).padStart(3, "0")}` : null;
  if (sc.invoice) s.invoices.unshift({ ...sc.invoice, run_id: runId });
  let approvalId: string | null = null;
  if (sc.payment && paymentId) {
    const payment: Payment = {
      id: paymentId,
      supplier: sc.payment.supplier,
      amount_usd: sc.payment.amount_usd,
      account_masked: result.payment_status === "paid" && id === "A2" ? "****1234" : sc.payment.account_masked,
      status: result.payment_status as Payment["status"],
      reason: result.summary,
      crs: sc.payment.crs,
      run_id: runId,
    };
    s.payments.unshift(payment);
    if (payment.status === "awaiting_maya") {
      approvalId = `apr-${String(s.counter).padStart(3, "0")}`;
      const askEvent = events.find((e) => e.decision === "ask");
      s.approvals.unshift({
        id: approvalId,
        payment_id: paymentId,
        run_id: runId,
        reason: askEvent?.reason ?? result.summary,
        amount_usd: payment.amount_usd,
        supplier: payment.supplier,
        account_masked: payment.account_masked,
        crs: payment.crs,
        status: "pending",
      });
    }
  }

  // Component state changes
  if (id === "A6" && caughtAt === "proxy") {
    const tool = s.components.find((c) => c.id === "tool-invoice-reader");
    if (tool) {
      tool.status = "quarantined";
      tool.fingerprint = "7be0d415";
    }
  }
  if (id === "A5" && caughtAt === "seller") {
    s.seller_strikes += 1;
    if (s.seller_strikes >= 2) {
      const agent = s.components.find((c) => c.id === "agent-acme-seller");
      if (agent) agent.status = "quarantined";
      events.push({
        node: "seller",
        edge: ["seller", "gate"],
        layer: "other_agents",
        mechanism: "access_control",
        decision: "deny",
        reason: "Second mismatch: seller agent quarantined until Maya re-approves it",
        rule: "R3",
      });
    }
  }

  const stamped = append(runId, events, paymentId);

  const rawBefore = s.balances.raw;
  const protBefore = s.balances.protected;
  s.balances.raw = round2(rawBefore + rawChange);
  s.balances.protected = round2(protBefore + result.balance_change_usd);

  if (sc.kind === "attack") {
    s.score.fired += 1;
    if (harm.type !== "none") s.score.harmed += 1;
    s.score.blocked += 1;
  }

  if (result.alert_maya) {
    const where = caughtAt ? ` at ${NODE_LABEL[caughtAt]}${rule ? ` (${rule})` : ""}` : "";
    say("sudibran", `${sc.title}: stopped${where}. ${result.summary}`);
  }

  const out: RunResult = {
    run_id: runId,
    scenario_id: id,
    kind: sc.kind,
    title: sc.title,
    injection: opts.injection ?? sc.injection,
    invoice: sc.invoice,
    switches: sw,
    raw: { steps: rawSteps, harm, balance_before: rawBefore, balance_after: s.balances.raw },
    protected: {
      events: stamped,
      caught_at: caughtAt,
      rule,
      result,
      balance_before: protBefore,
      balance_after: s.balances.protected,
      approval_id: approvalId,
      via_layer_off: viaLayerOff,
      model_resisted: modelResisted,
      note,
    },
  };
  s.runs.push(structuredClone(out));
  return out;
}

export function decideApproval(id: string, action: "approve" | "reject"): { approval: Approval; payment: Payment; events: AuditEvent[] } | null {
  const s = db();
  const approval = s.approvals.find((a) => a.id === id);
  if (!approval || approval.status !== "pending") return null;
  const payment = s.payments.find((p) => p.id === approval.payment_id)!;
  let events: ScenarioEvent[];

  if (action === "reject") {
    approval.status = "rejected";
    payment.status = "blocked";
    payment.reason = "Maya rejected it on the Sudibran approval card";
    events = [
      { node: "maya", edge: ["gate", "maya"], layer: "user_interface", mechanism: "human_in_loop", decision: "deny", reason: "Maya rejected the payment on the Sudibran card (R5)", rule: "R5" },
    ];
  } else {
    approval.status = "approved";
    events = [
      { node: "maya", edge: ["gate", "maya"], layer: "user_interface", mechanism: "human_in_loop", decision: "allow", reason: "Maya approved on the Sudibran card (R5)" },
    ];
    if (s.switches.audit_down) {
      payment.status = "on_hold";
      payment.reason = "Approved, but the audit log is down, so it's on hold (R4)";
      events.push({ node: "broker", edge: ["policy", "broker"], layer: "payment", mechanism: "monitoring", decision: "hold", reason: "R4: the audit log can't be written, so the payment is on hold", rule: "R4" });
    } else {
      payment.status = "paid";
      payment.reason = "Approved by Maya and paid";
      s.balances.protected = round2(s.balances.protected - payment.amount_usd);
      events.push(
        { node: "broker", edge: ["policy", "broker"], layer: "payment", mechanism: "credential", decision: "allow", reason: "One-time payment token issued" },
        { node: "nessie", edge: ["proxy", "nessie"], layer: "payment", mechanism: "monitoring", decision: "allow", reason: `Paid ${usd(payment.amount_usd)} to ${payment.supplier} ${payment.account_masked}` },
      );
    }
  }

  const stamped = append(approval.run_id, events, payment.id);
  const runRec = s.runs.find((r) => r.run_id === approval.run_id);
  if (runRec) {
    runRec.protected.events.push(...structuredClone(stamped));
    runRec.protected.result = { ...runRec.protected.result, payment_status: payment.status, summary: payment.reason };
    runRec.protected.balance_after = s.balances.protected;
  }
  say("sudibran", `${approval.supplier} ${usd(approval.amount_usd)}: ${action === "approve" ? payment.reason.toLowerCase() : "rejected by Maya"}.`);
  return { approval: { ...approval }, payment: { ...payment }, events: stamped };
}

function verifyChain(): EvidenceReport["chain"] {
  const { audit } = db();
  for (let i = 0; i < audit.length; i++) {
    const { hash, ...rest } = audit[i];
    const expectPrev = i === 0 ? GENESIS : audit[i - 1].hash;
    if (rest.prev_hash !== expectPrev || sha256(canonical(rest)) !== hash) {
      return { intact: false, checked_events: audit.length, broken_at: audit[i].seq };
    }
  }
  return { intact: true, checked_events: audit.length, broken_at: null };
}

export function evidence(runId: string): EvidenceReport | null {
  const s = db();
  const runRec = s.runs.find((r) => r.run_id === runId);
  if (!runRec) return null;
  const sc = SCENARIOS[runRec.scenario_id];
  const events = s.audit.filter((e) => e.run_id === runId);
  const crsEvent = events.find((e) => e.node === "crs");
  const messages: EvidenceReport["agent_messages"] = [];
  const injection = runRec.injection ?? sc.injection;
  if (injection) {
    messages.push({
      from: runRec.scenario_id === "A1" ? "maya (pasted text)" : runRec.scenario_id === "A6" ? "tool-invoice-reader (description)" : "agent-acme-seller",
      text: injection,
      labels: ["untrusted", "contains_instruction"],
    });
  } else if (sc.invoice) {
    messages.push({ from: sc.invoice.source_agent, text: `Invoice ${sc.invoice.id} · ${usd(sc.invoice.amount_usd)} · report ${sc.invoice.report_status}`, labels: ["untrusted"] });
  }
  return structuredClone({
    run_id: runId,
    scenario_id: runRec.scenario_id,
    title: runRec.title,
    generated_at: now(),
    switches: runRec.switches,
    intent: s.intent,
    agent_messages: messages,
    tool_calls: events.filter((e) => ["proxy", "invoice_reader", "supplier_db", "crs", "broker", "nessie"].includes(e.node)),
    decisions: events,
    approvals: s.approvals.filter((a) => a.run_id === runId),
    crs: crsEvent ? { checked: true, result: crsEvent.reason } : { checked: false, result: "Not needed: no new or changed account on this run" },
    outcome: { ...runRec.protected.result, caught_at: runRec.protected.caught_at, rule: runRec.protected.rule },
    chain: verifyChain(),
  });
}
