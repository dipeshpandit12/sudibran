"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { verifyInBrowser } from "@/lib/chain";
import { LAYER_LABEL, LAYER_ORDER, NODE_LABEL, RULE_LABEL } from "@/lib/labels";
import type { AuditEvent, EvidenceReport, Layer } from "@/lib/types";
import { Button, DecisionChip, PaymentChip, Panel, Tag } from "@/components/ui";
import { PAGE, PageHeader } from "@/components/PageHeader";

function ChainCheck({ report }: { report: EvidenceReport }) {
  const [events, setEvents] = useState<AuditEvent[]>(report.decisions);
  const [tampered, setTampered] = useState(false);
  const [local, setLocal] = useState<{ intact: boolean; broken_at: number | null } | null>(null);

  useEffect(() => {
    let live = true;
    setLocal(null);
    verifyInBrowser(events).then((r) => live && setLocal(r));
    return () => {
      live = false;
    };
  }, [events]);

  function tamper() {
    // Rewrite the run's decisive event as an attacker covering their tracks would.
    const idx = Math.max(0, events.findIndex((e) => e.decision === "deny" || e.decision === "ask"));
    setEvents(events.map((e, i) => (i === idx ? { ...e, decision: "allow", reason: "Payment approved" } : e)));
    setTampered(true);
  }

  const ok = local?.intact ?? report.chain.intact;
  return (
    <Panel className={`border-2 p-5 ${ok ? "border-safe-line" : "border-harm"}`}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={`grid size-11 shrink-0 place-items-center rounded-full text-[22px] font-bold text-white ${ok ? "bg-safe" : "bg-harm"}`}
        >
          {ok ? "✓" : "✗"}
        </span>
        <div className="min-w-0">
          <p className={`display text-[22px] ${ok ? "text-safe" : "text-harm"}`}>
            {local === null ? "Checking chain…" : ok ? "Chain intact" : `Chain broken at event ${local?.broken_at}`}
          </p>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Server checked all {report.chain.checked_events} events in the session ({report.chain.intact ? "intact" : `broken at ${report.chain.broken_at}`}).
            This browser re-hashed this run&apos;s {events.length} events with SHA-256 itself.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!tampered ? (
          <Button variant="danger" onClick={tamper}>
            Tamper with an event
          </Button>
        ) : (
          <Button
            onClick={() => {
              setEvents(report.decisions);
              setTampered(false);
            }}
          >
            Undo tampering
          </Button>
        )}
        <span className="self-center text-[13px] text-ink-3">
          {tampered ? "One decision was rewritten to “allowed”. Its hash no longer matches." : "Edits this copy only, to show what a forged record looks like."}
        </span>
      </div>
    </Panel>
  );
}

export default function EvidencePage() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer | "all">("all");

  useEffect(() => {
    api.evidence(runId).then(setReport).catch((e: Error) => setError(e.message));
  }, [runId]);

  const counts = useMemo(() => {
    const m = new Map<Layer, number>();
    report?.decisions.forEach((e) => m.set(e.layer, (m.get(e.layer) ?? 0) + 1));
    return m;
  }, [report]);

  function download() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sudibran-evidence-${report.run_id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error) {
    return (
      <main className={`${PAGE} py-10`}>
        <p className="text-[16px] text-harm">{error}</p>
        <Link href="/evidence" className="mt-3 inline-block font-semibold underline decoration-ink-3 underline-offset-2">
          See this session&apos;s runs
        </Link>
      </main>
    );
  }
  if (!report) return <main className={`${PAGE} py-10 text-ink-2`}>Assembling the report…</main>;

  const rows = layer === "all" ? report.decisions : report.decisions.filter((e) => e.layer === layer);
  const o = report.outcome;

  return (
    <main className={`${PAGE} space-y-8 py-10`}>
      <nav aria-label="Breadcrumb" className="text-[13.5px] text-ink-2">
        <Link href="/evidence" className="font-semibold text-ink underline decoration-ink-3 underline-offset-2">
          Audit trail
        </Link>{" "}
        / <span className="font-mono text-[13px]">{report.run_id}</span>
      </nav>
      <PageHeader
        kicker={`Report · generated ${new Date(report.generated_at).toLocaleTimeString()}`}
        title={report.title}
        actions={
          <>
            <Link href="/" className="rounded-lg border border-rule bg-surface px-3.5 py-2 text-[14px] font-semibold hover:bg-sunk">
              Back to dashboard
            </Link>
            <Button variant="primary" onClick={download}>
              Download JSON
            </Button>
          </>
        }
      >
        {o.caught_at ? (
          <>
            Caught at <strong className="text-ink">{NODE_LABEL[o.caught_at]}</strong>
            {o.rule ? <> · {RULE_LABEL[o.rule] ?? o.rule}</> : null}.{" "}
          </>
        ) : null}
        {o.summary}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="min-w-0 space-y-5">
          <ChainCheck key={report.run_id} report={report} />

          <Panel>
            <div className="border-b border-rule px-5 py-3">
              <h2 className="text-[16px] font-bold">Every check, in order</h2>
              <p className="text-[13px] text-ink-2">Filter by layer of the agent (Fig. 4 of Kim et al.).</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by layer">
                <button
                  onClick={() => setLayer("all")}
                  aria-pressed={layer === "all"}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${layer === "all" ? "border-ink bg-ink text-white" : "border-rule bg-surface text-ink-2 hover:bg-sunk"}`}
                >
                  All · {report.decisions.length}
                </button>
                {LAYER_ORDER.map((l) => {
                  const n = counts.get(l) ?? 0;
                  return (
                    <button
                      key={l}
                      onClick={() => setLayer(l)}
                      disabled={n === 0}
                      aria-pressed={layer === l}
                      className={`rounded-full border px-3 py-1 text-[13px] font-semibold disabled:opacity-40 ${
                        layer === l ? "border-ink bg-ink text-white" : "border-rule bg-surface text-ink-2 hover:bg-sunk"
                      }`}
                    >
                      {LAYER_LABEL[l]} · {n}
                    </button>
                  );
                })}
              </div>
            </div>
            <ol>
              {rows.map((e) => (
                <li key={e.seq} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 border-b border-rule px-5 py-3 last:border-0">
                  <span className="wide pt-0.5 text-right text-[14px] font-bold text-ink-3">#{e.seq}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{NODE_LABEL[e.node]}</span>
                      <DecisionChip decision={e.decision} off={e.off} />
                      {e.rule && <Tag tone={e.decision === "deny" ? "harm" : "neutral"}>{e.rule}</Tag>}
                      <span className="text-[13px] text-ink-3">
                        {LAYER_LABEL[e.layer]} · {e.mechanism.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[14.5px]">{e.reason}</p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-ink-3">
                      <span>{new Date(e.time).toLocaleTimeString()}</span>
                      <span>actor {e.actor}</span>
                      {e.labels.length > 0 && <span>labels {e.labels.join(", ")}</span>}
                      <span className="font-mono">hash {e.hash.slice(0, 12)}…</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Outcome</h2>
            <div className="mt-2 flex items-center gap-3">
              {o.payment_status !== "none" ? <PaymentChip status={o.payment_status} /> : <Tag>No payment attempted</Tag>}
              <span className="text-[14px] text-ink-2">Balance change {o.balance_change_usd === 0 ? "none" : `$${Math.abs(o.balance_change_usd)}`}</span>
            </div>
            {o.alert_maya && <p className="mt-2 text-[14px]">Maya was alerted.</p>}
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Maya&apos;s intent at the time</h2>
            <p className="mt-1.5 text-[15px]">“{report.intent.text}”</p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Threshold ${report.intent.threshold_usd} · {report.intent.signed ? "signed" : "unsigned"} · {report.intent.id}
            </p>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Incoming message</h2>
            {report.agent_messages.map((m, i) => (
              <div key={i} className="mt-2">
                <p className="text-[13px] text-ink-2">from {m.from}</p>
                <p className="mt-0.5 rounded-lg bg-flag-wash px-3 py-2 text-[14px] italic">“{m.text}”</p>
                <div className="mt-1.5 flex gap-1.5">
                  {m.labels.map((l) => (
                    <Tag key={l} tone="flag">
                      {l.replace(/_/g, " ")}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">CRS identity check (R7)</h2>
            <p className="mt-1 text-[14px]">{report.crs.result}</p>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Tool calls · {report.tool_calls.length}</h2>
            {report.tool_calls.length === 0 ? (
              <p className="mt-1 text-[14px] text-ink-2">No tool was called. The run stopped before any tool ran.</p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-[14px]">
                {report.tool_calls.map((t) => (
                  <li key={t.seq} className="flex items-center justify-between gap-2">
                    <span>{NODE_LABEL[t.node]}</span>
                    <DecisionChip decision={t.decision} off={t.off} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {report.approvals.length > 0 && (
            <Panel className="p-5">
              <h2 className="text-[16px] font-bold">Approvals</h2>
              {report.approvals.map((a) => (
                <p key={a.id} className="mt-1 text-[14px]">
                  {a.id}: ${a.amount_usd} to {a.supplier} · <strong>{a.status}</strong>
                </p>
              ))}
            </Panel>
          )}

          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Switches during this run</h2>
            <p className="mt-1 text-[14px] text-ink-2">
              Assume breach {report.switches.assume_breach ? "on" : "off"} · layer off {report.switches.layer_off ?? "none"} · audit{" "}
              {report.switches.audit_down ? "down" : "up"}
            </p>
          </Panel>
        </aside>
      </div>
    </main>
  );
}
