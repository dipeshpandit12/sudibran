"use client";
import { useState } from "react";

/*
  How Sudibran puts each Fig. 4 defense into practice. Picking a defense on the
  right highlights the components that implement it in the architecture.
*/

type Part = "web" | "seller" | "gate" | "agent" | "policy" | "broker" | "proxy" | "tools" | "registration" | "audit" | "postgres";

type Family = "Runtime protection" | "Secure by design" | "Identity and access" | "Component hardening";

const DEFENSES: { family: Family; name: string; parts: Part[]; how: string }[] = [
  { family: "Runtime protection", name: "Input guardrails", parts: ["gate"], how: "Screens Maya's instruction and saves it as her signed intent. Text she pastes from elsewhere is tagged untrusted." },
  { family: "Runtime protection", name: "Output guardrails", parts: ["gate", "web"], how: "Masks bank account numbers. Approval prompts are drawn by Sudibran, never by the AI." },
  { family: "Runtime protection", name: "Information flow control", parts: ["gate", "postgres"], how: "Every piece of data carries its source, in the AI's context and in memory. Untrusted data can never pick a payee." },
  { family: "Runtime protection", name: "Monitoring", parts: ["audit"], how: "Every check writes one event to a hash-chained audit log that feeds the live view and the evidence report." },
  { family: "Runtime protection", name: "Human-in-the-loop", parts: ["policy", "web"], how: "Payments over Maya's limit, or that trace back to untrusted text, wait for her approval card." },
  { family: "Secure by design", name: "Privilege separation", parts: ["agent"], how: "The parser reads untrusted invoices but has no tools. The planner can act but never sees raw untrusted text." },
  { family: "Secure by design", name: "Formal verification", parts: ["policy"], how: "Payment rules are written as OPA policy and tested before release, e.g. a payee only ever comes from the supplier record." },
  { family: "Identity and access", name: "Identity management", parts: ["gate", "seller", "tools"], how: "Checks every outside agent's identity and action report. CRS checks the holder of any new bank account." },
  { family: "Identity and access", name: "Credential management", parts: ["broker"], how: "No keys anywhere the AI can see. Each payment needs a one-time token from the broker." },
  { family: "Identity and access", name: "Access control", parts: ["postgres", "proxy"], how: "Row-level security on supplier data. Private data can't leave, and only Sudibran reads or writes memory." },
  { family: "Component hardening", name: "Model and tool hardening", parts: ["registration", "proxy"], how: "Every model and tool is fingerprinted when it connects. A changed description quarantines it." },
];

const PART_LABEL: Record<Part, string> = {
  web: "Maya's app",
  seller: "Seller agent",
  gate: "Gate",
  agent: "Agent",
  policy: "Policy",
  broker: "Key broker",
  proxy: "MCP proxy",
  tools: "Tools",
  registration: "Registration",
  audit: "Audit log",
  postgres: "Postgres",
};

const FAMILY_COLOR: Record<Family, string> = {
  "Runtime protection": "var(--color-blue)",
  "Secure by design": "var(--color-safe)",
  "Identity and access": "var(--color-ask)",
  "Component hardening": "var(--color-ink-3)",
};

function Box({
  id,
  lit,
  title,
  sub,
  tone = "plain",
  dashed,
  className = "",
}: {
  id: Part;
  lit: Set<Part>;
  title: string;
  sub: string;
  tone?: "plain" | "core" | "llm" | "edge";
  dashed?: boolean;
  className?: string;
}) {
  const on = lit.has(id);
  const base = {
    plain: "bg-surface",
    core: "bg-safe-wash/50",
    llm: "bg-flag-wash",
    edge: "bg-blue-wash/60",
  }[tone];
  return (
    <div
      className={`rounded-xl border-2 px-3 py-2.5 text-center transition-all duration-300 ${base} ${dashed ? "border-dashed" : ""} ${className}`}
      style={{
        borderColor: on ? "var(--color-ink)" : "var(--color-rule)",
        boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--color-ink) 14%, transparent)" : "none",
        transform: on ? "translateY(-2px)" : "none",
      }}
    >
      <p className="text-[15px] font-bold leading-tight">{title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{sub}</p>
    </div>
  );
}

const Arrow = () => (
  <span aria-hidden className="mx-1 shrink-0 text-[18px] font-bold text-ink-3">
    →
  </span>
);

export function ArchitectureMap() {
  const [sel, setSel] = useState(6);
  const d = DEFENSES[sel];
  const lit = new Set<Part>(d.parts);

  return (
    <div className="space-y-6">
      {/* The architecture */}
      <div className="overflow-x-auto rounded-xl border border-rule bg-paper/50 p-6">
        <div className="min-w-[1100px]">
        <p className="text-[13px] text-ink-2">Every request moves left to right. The two language models sit outside the trust layer.</p>

        <div className="mt-5 flex items-center justify-center">
          <Box id="seller" lit={lit} title="Seller agent" sub="Acme's AI · invoices + action reports" dashed className="w-[230px]" />
        </div>
        <div className="flex justify-center">
          <span aria-hidden className="h-5 w-0.5 bg-rule" />
        </div>

        <div className="flex items-stretch">
          <div className="flex items-center">
            <Box id="web" lit={lit} title="Maya's app" sub="requests + approvals" className="w-[140px]" />
            <Arrow />
          </div>

          <div className="relative flex min-w-0 flex-1 items-center gap-0 rounded-2xl border-[3px] border-ink bg-surface px-3 pb-3 pt-8">
            <span className="absolute left-4 top-2 text-[12.5px] font-bold">Sudibran trust layer</span>
            <Box id="gate" lit={lit} title="Gate" sub="who is it? tag the data" tone="core" className="min-w-0 flex-1" />
            <Arrow />
            <div className="relative min-w-0 flex-[1.4] rounded-xl border-2 border-dashed border-rule p-1.5 pt-5">
              <span className="absolute left-2 top-0.5 whitespace-nowrap text-[10.5px] font-semibold text-ink-3">outside the trust layer</span>
              <Box id="agent" lit={lit} title="Agent" sub="Planner LLM | Parser LLM" tone="llm" />
            </div>
            <Arrow />
            <Box id="policy" lit={lit} title="Policy" sub="OPA · allow / deny / ask" tone="core" className="min-w-0 flex-1" />
            <Arrow />
            <Box id="broker" lit={lit} title="Key broker" sub="one-time token" tone="core" className="min-w-0 flex-1" />
          </div>

          <div className="flex items-center">
            <Arrow />
            <Box id="proxy" lit={lit} title="MCP proxy" sub="checks args + token" tone="edge" className="w-[140px]" />
            <Arrow />
            <Box id="tools" lit={lit} title="Tools" sub="invoice-reader · supplier-db · CRS · Nessie" className="w-[170px]" />
          </div>
        </div>

        <div className="mx-auto mt-5 grid max-w-[760px] grid-cols-3 gap-3">
          <Box id="registration" lit={lit} title="Registration" sub="vet + pin each model and tool" />
          <Box id="audit" lit={lit} title="Audit log" sub="records every step, hash-chained" />
          <Box id="postgres" lit={lit} title="Postgres" sub="intents · suppliers · audit · memory" />
        </div>
        </div>
      </div>

      {/* Defense → component */}
      <div className="grid overflow-hidden rounded-xl border border-rule bg-surface md:grid-cols-2">
        <div className="border-b border-rule px-5 py-3 md:col-span-2">
          <p className="text-[14px] font-bold">Each defense from the paper, and what implements it</p>
          <p className="text-[12.5px] text-ink-2">Pick one to light it up in the architecture.</p>
        </div>
        <ol className="border-rule md:border-r">
          {DEFENSES.map((x, i) => (
            <li key={x.name}>
              <button
                onClick={() => setSel(i)}
                aria-pressed={sel === i}
                className={`flex w-full items-center gap-3 px-5 py-2 text-left text-[14px] hover:bg-sunk ${sel === i ? "bg-sunk font-semibold" : ""}`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[x.family] }} />
                <span className="flex-1">{x.name}</span>
                <span className="text-[12px] text-ink-3">{x.family}</span>
              </button>
            </li>
          ))}
        </ol>
        <div key={sel} className="step-in border-t border-rule px-6 py-5 md:border-t-0">
          <p className="text-[12.5px] font-semibold" style={{ color: FAMILY_COLOR[d.family] }}>
            {d.family}
          </p>
          <p className="display mt-1 text-[26px]">{d.name}</p>
          <p className="mt-2 text-[16.5px] leading-relaxed">{d.how}</p>
          <p className="mt-4 text-[13px] text-ink-2">Lit up in the architecture: {d.parts.map((x) => PART_LABEL[x]).join(", ")}</p>
        </div>
      </div>
    </div>
  );
}
