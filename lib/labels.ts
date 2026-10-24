import type { Decision, Layer, NodeId } from "./types";

export const NODE_LABEL: Record<NodeId, string> = {
  maya: "Maya",
  gate: "Gate",
  seller: "Seller agent",
  planner: "Planner",
  parser: "Parser",
  memory: "Memory",
  policy: "Policy",
  broker: "Broker",
  crs: "CRS",
  nessie: "Nessie",
  proxy: "Tool proxy",
  invoice_reader: "Invoice reader",
  supplier_db: "Supplier DB",
};

export const NODE_SUB: Record<NodeId, string> = {
  maya: "AP clerk",
  gate: "Sudibran",
  seller: "Acme's AI",
  planner: "Droid on Claude",
  parser: "Claude, no tools",
  memory: "Long-term",
  policy: "OPA rules",
  broker: "One-time tokens",
  crs: "Identity + fraud",
  nessie: "Bank sandbox",
  proxy: "MCP proxy",
  invoice_reader: "MCP tool",
  supplier_db: "MCP tool",
};

export const NODE_LAYER: Record<NodeId, Layer> = {
  maya: "user_interface",
  gate: "user_interface",
  seller: "other_agents",
  planner: "workflow",
  parser: "llm",
  memory: "memory",
  policy: "workflow",
  broker: "payment",
  crs: "payment",
  nessie: "payment",
  proxy: "tool",
  invoice_reader: "external_data",
  supplier_db: "private_data",
};

export const LAYER_LABEL: Record<Layer, string> = {
  user_interface: "User interface",
  llm: "LLM",
  workflow: "Agent workflow",
  memory: "Memory",
  other_agents: "Other agents",
  tool: "Tool",
  external_data: "External data",
  private_data: "Private data",
  payment: "Payment",
};

export const LAYER_ORDER: Layer[] = [
  "user_interface",
  "llm",
  "workflow",
  "memory",
  "other_agents",
  "tool",
  "external_data",
  "private_data",
  "payment",
];

export const DECISION_LABEL: Record<Decision, string> = {
  allow: "Allowed",
  flag: "Flagged",
  deny: "Denied",
  ask: "Asked Maya",
  hold: "On hold",
};

/** Worst-colour-wins ordering for a node across one run. */
export const DECISION_RANK: Record<Decision, number> = { allow: 1, hold: 2, flag: 3, ask: 4, deny: 5 };

export const RULE_LABEL: Record<string, string> = {
  R1: "R1 threshold",
  R2: "R2 payee not on supplier record",
  R3: "R3 agent report mismatch",
  R4: "R4 audit outage",
  R5: "R5 untrusted instruction needs Maya",
  R7: "R7 CRS fraud flag",
  FP: "tool fingerprint mismatch",
  PD: "private data can't leave",
  RLS: "row-level security",
  INTENT: "not covered by Maya's intent or policy",
};

export function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
