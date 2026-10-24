// Data contracts shared by the mock backend and the UI (README §5).

export type Decision = "allow" | "flag" | "deny" | "ask" | "hold";

export type Layer =
  | "user_interface"
  | "llm"
  | "workflow"
  | "memory"
  | "other_agents"
  | "tool"
  | "external_data"
  | "private_data"
  | "payment";

export type NodeId =
  | "maya"
  | "gate"
  | "seller"
  | "planner"
  | "parser"
  | "memory"
  | "policy"
  | "broker"
  | "crs"
  | "nessie"
  | "proxy"
  | "invoice_reader"
  | "supplier_db";

/** One step as written in a scenario file, before the mock stamps it. */
export interface ScenarioEvent {
  node: NodeId;
  edge: [NodeId, NodeId];
  layer: Layer;
  mechanism: string;
  decision: Decision;
  reason: string;
  rule?: string;
  /** Set by the mock when a check is switched off for the demo. */
  off?: boolean;
}

/** R8: one record per check, chained by hash. */
export interface AuditEvent extends ScenarioEvent {
  seq: number;
  time: string;
  run_id: string;
  step: number;
  actor: string;
  labels: string[];
  payment_id: string | null;
  prev_hash: string;
  hash: string;
}

export interface Intent {
  id: string;
  text: string;
  threshold_usd: number;
  permissions: string[];
  signed: boolean;
  created_at: string;
}

export interface Component {
  id: string;
  type: "mcp_tool" | "model" | "agent" | "service";
  name: string;
  description: string;
  fingerprint: string;
  status: "verified" | "quarantined";
}

export interface Supplier {
  id: string;
  name: string;
  account_masked: string;
  crs: "clean" | "flagged";
}

export interface Invoice {
  id: string;
  supplier: string;
  amount_usd: number;
  source_agent: string;
  report_status: "verified" | "unverified" | "mismatch";
  run_id: string;
}

export type PaymentStatus = "paid" | "blocked" | "awaiting_maya" | "on_hold";

export interface Payment {
  id: string;
  supplier: string;
  amount_usd: number;
  account_masked: string;
  status: PaymentStatus;
  reason: string;
  crs: "clean" | "flagged" | "not_needed";
  run_id: string;
}

export interface Approval {
  id: string;
  payment_id: string;
  run_id: string;
  reason: string;
  amount_usd: number;
  supplier: string;
  account_masked: string;
  crs: "clean" | "flagged" | "not_needed";
  status: "pending" | "approved" | "rejected";
}

export interface ChatMessage {
  id: string;
  from: "maya" | "agent" | "sudibran";
  text: string;
  untrusted?: boolean;
  time: string;
}

export interface Harm {
  type: "money" | "data" | "none";
  amount_usd: number;
  detail: string;
}

export interface ProtectedResult {
  payment_status: PaymentStatus | "none";
  balance_change_usd: number;
  alert_maya: boolean;
  summary: string;
}

export interface LayerOffEnding {
  events_tail: ScenarioEvent[];
  caught_at: NodeId;
  rule: string;
  result?: Partial<ProtectedResult>;
}

export interface Scenario {
  id: string;
  kind: "attack" | "story";
  layer: Layer;
  title: string;
  injection: string | null;
  invoice: Omit<Invoice, "run_id"> | null;
  payment: { supplier: string; amount_usd: number; account_masked: string; crs: Payment["crs"] } | null;
  raw: {
    steps: string[];
    harm: Harm;
    balance_change_usd: number;
  };
  protected: {
    events: ScenarioEvent[];
    caught_at: NodeId | null;
    rule: string | null;
    result: ProtectedResult;
    layer_off?: Record<string, LayerOffEnding>;
  };
}

export interface AttackInfo {
  id: string;
  short: string;
  layer: Layer;
  title: string;
  description: string;
}

export interface Check {
  key: string;
  label: string;
  node: NodeId;
  rule?: string;
}

export interface DemoSwitches {
  assume_breach: boolean;
  layer_off: string | null;
  audit_down: boolean;
}

export interface RunResult {
  run_id: string;
  scenario_id: string;
  kind: Scenario["kind"];
  title: string;
  injection: string | null;
  invoice: Scenario["invoice"];
  switches: DemoSwitches;
  raw: {
    steps: string[];
    harm: Harm;
    balance_before: number;
    balance_after: number;
  };
  protected: {
    events: AuditEvent[];
    caught_at: NodeId | null;
    rule: string | null;
    result: ProtectedResult;
    balance_before: number;
    balance_after: number;
    approval_id: string | null;
    via_layer_off: boolean;
    model_resisted: boolean;
    note: string | null;
  };
}

export interface Score {
  fired: number;
  harmed: number;
  blocked: number;
}

export interface DemoState {
  intent: Intent;
  suppliers: Supplier[];
  components: Component[];
  balances: { raw: number; protected: number };
  invoices: Invoice[];
  payments: Payment[];
  approvals: Approval[];
  chat: ChatMessage[];
  switches: DemoSwitches;
  score: Score;
  runs: RunResult[];
  audit_length: number;
}

export interface EvidenceReport {
  run_id: string;
  scenario_id: string;
  title: string;
  generated_at: string;
  switches: DemoSwitches;
  intent: Intent;
  agent_messages: { from: string; text: string; labels: string[] }[];
  tool_calls: AuditEvent[];
  decisions: AuditEvent[];
  approvals: Approval[];
  crs: { checked: boolean; result: string };
  outcome: ProtectedResult & { caught_at: NodeId | null; rule: string | null };
  chain: { intact: boolean; checked_events: number; broken_at: number | null };
}

/** One entry in data/experiment.json: the plain-language story of a scenario. */
export interface Chapter {
  id: string;
  kind: "baseline" | "threat";
  label: string;
  title: string;
  intro: string;
  model: string;
  sudibran: string;
}
