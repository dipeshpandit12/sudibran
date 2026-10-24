// The one client every page uses. Point these paths at the real gate later without touching pages.
import type {
  Approval,
  AttackInfo,
  AuditEvent,
  ChatMessage,
  Check,
  Component,
  DemoState,
  DemoSwitches,
  EvidenceReport,
  Intent,
  Payment,
  RunResult,
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
  state: () => call<DemoState>("/api/state"),
  components: () => call<Component[]>("/api/components"),
  attacks: () => call<AttackInfo[]>("/api/attacks"),
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
