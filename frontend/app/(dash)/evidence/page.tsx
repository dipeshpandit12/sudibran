"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { NODE_LABEL, RULE_LABEL } from "@/lib/labels";
import type { EvidenceReport, RunResult } from "@/lib/types";
import { PAGE, PageHeader, Stat } from "@/components/PageHeader";
import { Panel, PaymentChip, Tag } from "@/components/ui";
import { Reveal } from "@/components/Reveal";

type Filter = "all" | "stopped" | "review" | "paid";

function outcomeOf(r: RunResult): Filter {
  const st = r.protected.result.payment_status;
  if (st === "paid") return "paid";
  if (st === "awaiting_maya" || r.protected.rule === "INTENT") return "review";
  return "stopped";
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All runs" },
  { id: "stopped", label: "Stopped" },
  { id: "review", label: "Needs review" },
  { id: "paid", label: "Paid" },
];

export default function AuditTrail() {
  const [runs, setRuns] = useState<RunResult[] | null>(null);
  const [events, setEvents] = useState(0);
  const [chain, setChain] = useState<EvidenceReport["chain"] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.state().then(async (s) => {
      const list = [...s.runs].reverse();
      setRuns(list);
      setEvents(s.audit_length);
      // Any report re-checks the whole chain on the server.
      if (list[0]) setChain((await api.evidence(list[0].run_id)).chain);
    });
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, stopped: 0, review: 0, paid: 0 };
    runs?.forEach((r) => {
      c.all++;
      c[outcomeOf(r)]++;
    });
    return c;
  }, [runs]);

  const shown = (runs ?? []).filter((r) => filter === "all" || outcomeOf(r) === filter);

  return (
    <main className={`${PAGE} page-in space-y-8`}>
      <PageHeader kicker="Audit trail" title="Every decision, on the record">
        One report per run, built from a tamper-evident chain of every check Sudibran made. Open any run to see why it was
        allowed, held or stopped.
      </PageHeader>

      <Reveal as="section" aria-label="Summary" stagger step={80} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Runs recorded" value={String(counts.all)} note="This session" />
        <Stat label="Checks recorded" value={String(events)} note="One event per check (R8)" />
        <Stat
          label="Chain integrity"
          value={chain ? (chain.intact ? "Intact" : "Broken") : "—"}
          note={
            chain ? (
              chain.intact ? (
                <span className="font-semibold text-safe">✓ All {chain.checked_events} hashes verified</span>
              ) : (
                <span className="font-semibold text-harm">✕ Broken at event {chain.broken_at}</span>
              )
            ) : (
              "Verified once a run exists"
            )
          }
        />
        <Stat label="Stopped by Sudibran" value={String(counts.stopped)} note={`${counts.review} held for review`} />
      </Reveal>

      <Reveal as="section" delay={60}>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter runs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                filter === f.id ? "border-ink bg-ink text-onink" : "border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink"
              }`}
            >
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>

        <Panel className="overflow-hidden">
          {runs === null ? (
            <p className="px-5 py-8 text-ink-2">Loading runs…</p>
          ) : runs.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-ink-2">
              Nothing recorded yet.{" "}
              <Link href="/dashboard#test" className="font-semibold text-ink underline decoration-ink-3 underline-offset-2">
                Test an injection on the protection flow
              </Link>{" "}
              and its report will appear here.
            </p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-ink-2">No runs match this filter.</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <thead className="bg-paper/60 text-[12.5px] text-ink-2">
                <tr className="border-b border-rule">
                  <th className="px-5 py-2.5 font-semibold">Run</th>
                  <th className="px-3 py-2.5 font-semibold">What happened</th>
                  <th className="px-3 py-2.5 font-semibold">Decided at</th>
                  <th className="px-3 py-2.5 font-semibold">Outcome</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Checks</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const p = r.protected;
                  const t = p.events[0]?.time;
                  return (
                    <tr key={r.run_id} className="row-hover border-b border-rule last:border-0 hover:bg-paper/50">
                      <td className="px-5 py-3">
                        <Link href={`/evidence/${r.run_id}`} className="font-mono text-[13px] font-semibold underline decoration-ink-3 underline-offset-2">
                          {r.run_id}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">{r.title}</p>
                        <p className="text-[12.5px] text-ink-3">{r.kind === "attack" ? "Attack" : "Invoice"}</p>
                      </td>
                      <td className="px-3 py-3 text-[13.5px] text-ink-2">
                        {p.caught_at ? (
                          <>
                            <span className="font-semibold text-ink">{NODE_LABEL[p.caught_at]}</span>
                            {p.rule && <span> · {RULE_LABEL[p.rule] ?? p.rule}</span>}
                          </>
                        ) : (
                          "Every check passed"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {p.result.payment_status !== "none" ? (
                          <PaymentChip status={p.result.payment_status} />
                        ) : p.rule === "INTENT" ? (
                          <Tag tone="flag">Held for review</Tag>
                        ) : (
                          <Tag tone="safe">Nothing left</Tag>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{p.events.length}</td>
                      <td className="px-5 py-3 text-right text-[13px] text-ink-2">{t ? new Date(t).toLocaleTimeString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </Reveal>
    </main>
  );
}
