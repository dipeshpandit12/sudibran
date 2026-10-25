"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

/*
  A looping recording of Maya's chat with her payments agent: she types one
  sentence, the agent works through each tool and service, then pays.
*/

const REQUEST = "Pay this week's verified invoice from Acme.";

const STEPS: { label: string; via: string; kind: string; result: string }[] = [
  { label: "Reading invoice INV-2041", via: "invoice-reader", kind: "MCP tool", result: "$90.00" },
  { label: "Looking up Acme's bank account", via: "supplier-db", kind: "MCP tool", result: "****1234" },
  { label: "Checking the account holder", via: "CRS", kind: "Fraud check", result: "Clean" },
  { label: "Getting a payment token", via: "Broker", kind: "Service", result: "Issued" },
  { label: "Sending the payment", via: "Nessie", kind: "Bank", result: "Sent" },
];

// Timeline, in ticks of 140 ms
const TYPE_END = REQUEST.length; // one character per tick
const STEP_AT = (i: number) => TYPE_END + 6 + i * 6;
const DONE_AT = STEP_AT(STEPS.length) + 2;
const LOOP_AT = DONE_AT + 26;

export function AgentChatAnimation() {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(DONE_AT);
      return;
    }
    const id = window.setInterval(() => setT((x) => (x >= LOOP_AT ? 0 : x + 1)), 140);
    return () => window.clearInterval(id);
  }, []);

  const typed = REQUEST.slice(0, Math.min(t, TYPE_END));
  const sent = t > TYPE_END + 2;
  const stepsShown = STEPS.filter((_, i) => t >= STEP_AT(i)).length;
  const working = sent && t < DONE_AT;
  const done = t >= DONE_AT;

  return (
    <figure className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_24px_60px_-30px_rgba(21,35,63,0.45)]">
      {/* App header */}
      <div className="flex items-center gap-3 border-b border-rule px-5 py-3">
        <Image
          src="/favicon-32x32.png"
          alt="Sudibran"
          width={32}
          height={32}
          className="size-9 rounded-full"
        />
        <div className="leading-tight">
          <p className="text-[15px] font-bold">Payments assistant</p>
          <p className="text-[12.5px] text-ink-2">{working ? "Working…" : "Online"}</p>
        </div>
        <span className="ml-auto rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-2">Acme Supplies · AP</span>
      </div>

      {/* Conversation */}
      <div className="flex min-h-[430px] flex-col gap-3 bg-paper/50 px-5 py-5">
        <p className="self-center text-[12px] text-ink-3">Today 9:41</p>

        {sent && (
          <div className="step-in max-w-[78%] self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-onink">{REQUEST}</div>
        )}

        {sent && (
          <div className="step-in flex max-w-[88%] gap-2.5 self-start">
            <Image
              src="/favicon-32x32.png"
              alt="Sudibran assistant"
              width={32}
              height={32}
              className="mt-1 size-7 shrink-0 rounded-full"
            />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-rule bg-surface px-4 py-3">
              <p className="text-[14.5px]">On it. Here&apos;s what I&apos;m doing:</p>
              <ul className="mt-2.5 space-y-1.5">
                {STEPS.slice(0, stepsShown).map((s, i) => {
                  const running = working && i === stepsShown - 1 && t < STEP_AT(i) + 4;
                  return (
                    <li key={s.label} className="step-in flex items-center gap-2.5 text-[13.5px]">
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                          running ? "border-2 border-safe border-t-transparent animate-spin motion-reduce:animate-none" : "bg-safe text-onink"
                        }`}
                      >
                        {running ? "" : "✓"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      <span className="shrink-0 rounded-md bg-sunk px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{s.via}</span>
                      <span className={`w-[64px] shrink-0 text-right text-[12.5px] font-semibold ${running ? "text-ink-3" : "text-safe"}`}>
                        {running ? "…" : s.result}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {working && stepsShown === 0 && (
                <span className="mt-2 inline-flex gap-1" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-ink-3 motion-reduce:animate-none" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        {done && (
          <div className="step-in flex max-w-[88%] gap-2.5 self-start">
            <Image
              src="/favicon-32x32.png"
              alt="Sudibran assistant"
              width={32}
              height={32}
              className="mt-1 size-7 shrink-0 rounded-full"
            />
            <div className="rounded-2xl rounded-tl-md border border-safe-line bg-surface px-4 py-3">
              <p className="text-[14.5px]">Done. Acme&apos;s invoice is paid.</p>
              <div className="mt-2.5 flex items-center gap-6 rounded-lg bg-safe-wash px-3.5 py-2.5">
                <div>
                  <p className="text-[12px] text-ink-2">Paid to Acme Supplies</p>
                  <p className="font-mono text-[13px]">****1234 · INV-2041</p>
                </div>
                <p className="display text-[22px] text-safe">$90.00</p>
              </div>
              <p className="mt-1.5 text-[12px] text-ink-3">5 steps · 2.4 seconds</p>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-3 border-t border-rule px-4 py-3">
        <div className="min-h-[40px] flex-1 rounded-full border border-rule bg-paper px-4 py-2 text-[15px]">
          {!sent ? (
            <>
              {typed}
              <span className="ml-px inline-block h-[18px] w-px translate-y-[3px] animate-pulse bg-ink motion-reduce:animate-none" />
            </>
          ) : (
            <span className="text-ink-3">Message your assistant</span>
          )}
        </div>
        <span className={`grid size-10 place-items-center rounded-full text-[17px] font-bold text-onink transition-colors ${!sent && typed.length === REQUEST.length ? "bg-ink" : "bg-rule"}`}>
          ↑
        </span>
      </div>
    </figure>
  );
}
