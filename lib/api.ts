// Every request is same-origin in the browser and proxied to FastAPI by next.config.ts.
import type {
  Approval,
  AttackInfo,
  AuditEvent,
  BackendHealth,
  ChatMessage,
  Check,
  Component,
  DemoState,
  DemoSwitches,
  EvidenceReport,
  Intent,
  Payment,
  RunResult,
  ScenarioInfo,
} from "./types";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request to ${path} failed (${res.status})`);
  return data as T;
}

export const api = {
  health: () => call<BackendHealth>("/api/health"),
  state: () => call<DemoState>("/api/state"),
  components: () => call<Component[]>("/api/components"),
  attacks: () => call<AttackInfo[]>("/api/attacks"),
  scenarios: () => call<ScenarioInfo[]>("/api/scenarios"),
  checks: () => call<Check[]>("/api/checks"),
  runAttack: (id: string) => call<RunResult>(`/api/attacks/${id}`, { method: "POST" }),
  runStory: (id: string) => call<RunResult>(`/api/story/${id}`, { method: "POST" }),
  inject: (text: string) => call<RunResult>("/api/inject", { method: "POST", body: { text } }),
  setSwitches: (patch: Partial<DemoSwitches>) => call<DemoSwitches>("/api/switches", { method: "POST", body: patch }),
  reset: () => call<DemoState>("/api/demo/reset", { method: "POST" }),
  decide: (id: string, action: "approve" | "reject") =>
    call<{ approval: Approval; payment: Payment; events: AuditEvent[] }>(`/api/approvals/${id}`, { method: "POST", body: { action } }),
  saveIntent: (text: string, threshold_usd: number) => call<Intent>("/api/intents", { method: "POST", body: { text, threshold_usd } }),
  chat: (text: string, pasted = false) => call<ChatMessage[]>("/api/chat", { method: "POST", body: { text, pasted } }),
  evidence: (runId: string) => call<EvidenceReport>(`/api/evidence/${runId}`),
};
