import Link from "next/link";

import type { CSSProperties } from "react";

/*
  The overview's opening. Everything behind the words is mixed from the theme
  tokens, so the same composition reads as ledger paper in the light theme and
  as deep space in the dark one.
*/
const CARDS: { rule: string; title: string; body: string; tone: "safe" | "ask" | "harm" }[] = [
  { rule: "R2", title: "Payee from records", body: "Account ****4421 came from the invoice. Ignored.", tone: "harm" },
  { rule: "R1", title: "Over your limit", body: "$750 to Acme is waiting for Maya.", tone: "ask" },
  { rule: "R8", title: "Written to the ledger", body: "11 checks, hash-chained.", tone: "safe" },
];

const TONE = {
  safe: "border-safe-line bg-safe-wash text-safe",
  ask: "border-ask-line bg-ask-wash text-ask",
  harm: "border-harm-line bg-harm-wash text-harm",
};

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-rule">
      {/* Layer 1: the drifting light. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ opacity: "var(--aurora-strength)" }}>
        {/* A cold glow under the headline, a warm one behind the checks. */}
        <span
          className="aurora aurora-a -top-32 -left-28 size-[620px] opacity-70"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-safe) 70%, transparent), transparent 68%)" }}
        />
        <span
          className="aurora aurora-b top-[-60px] right-[-140px] size-[680px] opacity-65"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-harm) 62%, transparent), transparent 68%)" }}
        />
        <span
          className="aurora aurora-a bottom-[-220px] left-[38%] size-[520px] opacity-50"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-blue) 60%, transparent), transparent 70%)" }}
        />
      </div>
      {/* Layer 2: the dot field, fading out before it reaches the text. */}
      <div
        aria-hidden
        className="dotfield pointer-events-none absolute inset-0 -z-10"
        style={{ opacity: "var(--dot-strength)", maskImage: "radial-gradient(130% 100% at 75% 5%, #000 0%, transparent 70%)", WebkitMaskImage: "radial-gradient(130% 100% at 75% 5%, #000 0%, transparent 70%)" }}
      />

      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-10 px-6 pt-20 pb-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pt-28 lg:pb-24">
        <div className="intro">
          <p className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface/70 px-3 py-1 text-[13px] font-semibold text-ink-2 backdrop-blur">
            <span className="size-2 rounded-full bg-safe" />
            <span>Built on the agentic-AI defense landscape, Kim et al.</span>
          </p>

          <h1 className="display mt-6 text-[clamp(42px,6.4vw,76px)] leading-[1.02]">
            <span className="line-clip block">
              <span>Your AI agent</span>
            </span>
            <span className="line-clip block">
              <span style={{ "--d": "110ms" } as CSSProperties}>pays the bills now.</span>
            </span>
            <span className="line-clip block text-ink-2">
              <span style={{ "--d": "220ms" } as CSSProperties}>Who checks it?</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[52ch] text-[18px] leading-relaxed text-ink-2">
            One line hidden in an invoice is enough to send your money somewhere else. Sudibran puts a check on every layer of
            the agent, so a fooled step is never the last word.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-onink transition-transform hover:-translate-y-0.5"
            >
              See how it works
            </Link>
            <Link
              href="#what-if"
              className="rounded-full border border-rule bg-surface px-6 py-3 text-[15px] font-semibold transition-colors hover:border-ink-3"
            >
              What can go wrong
            </Link>
          </div>
        </div>

        {/* Layer 3: the checks themselves, hanging in the light. */}
        <div aria-hidden className="relative hidden h-[360px] lg:block">
          {CARDS.map((c, i) => (
            <article
              key={c.rule}
              className={`float-${i + 1} absolute w-[310px] rounded-xl border border-rule bg-surface/85 p-4 shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--color-ink)_60%,transparent)] backdrop-blur`}
              style={{ top: `${i * 118}px`, left: `${i === 1 ? 72 : i === 2 ? 24 : 0}px` }}
            >
              <p className="flex items-center gap-2">
                <span className={`rounded border px-1.5 py-px font-mono text-[11.5px] font-bold ${TONE[c.tone]}`}>{c.rule}</span>
                <span className="text-[14.5px] font-bold">{c.title}</span>
              </p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{c.body}</p>
            </article>
          ))}
        </div>
      </div>

      <Link href="#how" aria-label="Read on" className="mx-auto mb-8 flex w-fit text-ink-3">
        <svg aria-hidden viewBox="0 0 24 24" className="chev size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Link>
    </section>
  );
}
