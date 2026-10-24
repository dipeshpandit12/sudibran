"use client";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { usd } from "@/lib/labels";
import type { Component, DemoState } from "@/lib/types";
import { PAGE, PageHeader, SectionTitle } from "@/components/PageHeader";
import { Button, Panel, Tag } from "@/components/ui";

const TYPE_LABEL: Record<Component["type"], string> = {
  model: "Model",
  mcp_tool: "MCP tool",
  agent: "Outside agent",
  service: "Service",
};

// The decided rules from the design (R1–R8). Every one is enforced on every payment.
const RULES: { id: string; name: string; does: string; layer: string }[] = [
  { id: "R1", name: "Approval limit", does: "Any payment above your limit waits for your confirmation.", layer: "Agent workflow" },
  { id: "R2", name: "Payee from records", does: "The bank account always comes from the supplier record, never from invoice or message text.", layer: "Agent workflow" },
  { id: "R3", name: "Agent reports", does: "Other agents must send an action report. No report is unverified; a mismatch is blocked; repeat offenders are quarantined.", layer: "Other agents" },
  { id: "R4", name: "Audit outage", does: "If the audit log can't be written, payments stop and show as on hold.", layer: "Monitoring" },
  { id: "R5", name: "Approvals drawn by Sudibran", does: "Approval prompts come from Sudibran in your app, never from the AI, so they can't be faked.", layer: "User interface" },
  { id: "R6", name: "Fail closed", does: "If a safety component is down, payments are denied rather than allowed.", layer: "Every layer" },
  { id: "R7", name: "CRS check on new accounts", does: "Any new or changed bank account gets a CRS identity and fraud check. A fraud flag blocks the payment.", layer: "Payment" },
  { id: "R8", name: "One record format", does: "Every check writes one event to the tamper-evident audit chain.", layer: "Monitoring" },
];

function ComponentCard({ c }: { c: Component }) {
  const bad = c.status === "quarantined";
  return (
    <li className={`flex flex-col rounded-xl border-2 bg-surface p-4 ${bad ? "border-dashed border-harm" : "border-rule"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-ink-3">{TYPE_LABEL[c.type]}</p>
          <h3 className="text-[16px] font-bold leading-tight">{c.name}</h3>
        </div>
        <Tag tone={bad ? "harm" : "safe"}>{bad ? "✕ Quarantined" : "✓ Verified"}</Tag>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{c.description}</p>
      <p className="mt-auto flex items-center justify-between gap-2 border-t border-rule pt-3 text-[12.5px] text-ink-3">
        Fingerprint
        <span className={`rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] ${bad ? "text-harm" : "text-ink"}`}>{c.fingerprint}</span>
      </p>
      {bad && <p className="mt-2 text-[13px] font-medium text-harm">Changed since it was registered. Blocked until you re-approve it.</p>}
    </li>
  );
}

export default function Policies() {
  const [state, setState] = useState<DemoState | null>(null);
  const [text, setText] = useState("");
  const [threshold, setThreshold] = useState(500);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.state().then((s) => {
      setState(s);
      setText(s.intent.text);
      setThreshold(s.intent.threshold_usd);
    });
  }, []);

  async function save() {
    setError(null);
    try {
      const intent = await api.saveIntent(text, threshold);
      setState((s) => (s ? { ...s, intent } : s));
      setSaved(`Signed and saved at ${new Date(intent.created_at).toLocaleTimeString()}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!state) return <main className={`${PAGE} py-10 text-ink-2`}>Loading policies…</main>;
  const dirty = text !== state.intent.text || threshold !== state.intent.threshold_usd;
  const quarantined = state.components.filter((c) => c.status === "quarantined").length;

  return (
    <main className={`${PAGE} space-y-12 py-10`}>
      <PageHeader kicker="Policies" title="What your agent is allowed to do">
        Maya&apos;s intent and the rules Sudibran enforces on every payment, whatever the AI reads or is told.
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Intent */}
        <section>
          <SectionTitle title="Maya's intent">Signed by Sudibran. Every payment is checked against it.</SectionTitle>
          <Panel className="p-6">
            <label htmlFor="intent-text" className="text-[14px] font-semibold">
              Standing instruction
            </label>
            <textarea
              id="intent-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(null);
              }}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-lg border border-rule bg-paper px-3.5 py-2.5 text-[16px]"
            />

            <div className="mt-6 flex items-baseline justify-between">
              <label htmlFor="threshold" className="text-[14px] font-semibold">
                Ask me before paying more than
              </label>
              <span className="display text-[30px] tabular-nums">{usd(threshold).replace(".00", "")}</span>
            </div>
            <input
              id="threshold"
              type="range"
              min={150}
              max={600}
              step={10}
              value={threshold}
              onChange={(e) => {
                setThreshold(Number(e.target.value));
                setSaved(null);
              }}
              className="mt-2 w-full accent-ink"
            />
            <div className="flex justify-between text-[12px] text-ink-3">
              <span>$150</span>
              <span>$600</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
              <Button variant="primary" onClick={save} disabled={!dirty || !text.trim()}>
                Sign and save intent
              </Button>
              {saved && <span className="text-[14px] font-medium text-safe">✓ {saved}</span>}
              {!saved && !dirty && state.intent.signed && <Tag tone="safe">✓ Signed · {state.intent.id}</Tag>}
              {dirty && <span className="text-[13px] text-ink-2">Unsaved changes</span>}
            </div>
            {error && <p className="mt-2 text-[14px] text-harm">{error}</p>}
          </Panel>

          <div className="mt-6">
            <SectionTitle title="Suppliers on file">R2: the payee always comes from here.</SectionTitle>
            <Panel className="overflow-hidden">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-paper/60 text-[12.5px] text-ink-2">
                  <tr className="border-b border-rule">
                    <th className="px-5 py-2.5 font-semibold">Supplier</th>
                    <th className="px-3 py-2.5 font-semibold">Account</th>
                    <th className="px-5 py-2.5 text-right font-semibold">CRS</th>
                  </tr>
                </thead>
                <tbody>
                  {state.suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-rule last:border-0">
                      <td className="px-5 py-3 font-semibold">{s.name}</td>
                      <td className="px-3 py-3 font-mono text-[13px] text-ink-2">{s.account_masked}</td>
                      <td className="px-5 py-3 text-right">
                        <Tag tone="safe">✓ {s.crs}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </section>

        {/* Rules */}
        <section>
          <SectionTitle title="Rules Sudibran enforces">Hard rules, not filters. They decide whether a payment is possible at all.</SectionTitle>
          <Panel className="overflow-hidden">
            <ol>
              {RULES.map((r) => (
                <li key={r.id} className="flex gap-4 border-b border-rule px-5 py-4 last:border-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink font-mono text-[13px] font-bold text-white">{r.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-[16px] font-bold">{r.id === "R1" ? `${r.name}: ${usd(state.intent.threshold_usd).replace(".00", "")}` : r.name}</h3>
                      <span className="text-[12.5px] text-ink-3">{r.layer}</span>
                    </div>
                    <p className="mt-0.5 text-[14.5px] leading-snug text-ink-2">{r.does}</p>
                  </div>
                  <span className="self-start">
                    <Tag tone="safe">✓ Enforced</Tag>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </section>
      </div>

      <section>
        <SectionTitle
          title="Connected components"
          actions={
            <span className="text-[13.5px] text-ink-2">
              {state.components.length - quarantined} verified{quarantined > 0 && <span className="font-semibold text-harm"> · {quarantined} quarantined</span>}
            </span>
          }
        >
          Every model, tool and outside agent is fingerprinted when it connects. If it changes later, it&apos;s quarantined before it runs.
        </SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {state.components.map((c) => (
            <ComponentCard key={c.id} c={c} />
          ))}
        </ul>
      </section>
    </main>
  );
}
