"use client";
import { useState } from "react";
import type { Check, DemoState } from "@/lib/types";
import { Button } from "./ui";

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunk">
      <span className={`relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-rule"}`}>
        <span className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-[left] ${on ? "left-[16px]" : "left-[2px]"}`} />
      </span>
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="block text-[12.5px] leading-snug text-ink-2">{hint}</span>
      </span>
    </button>
  );
}

export function Controls({
  state,
  checks,
  onSwitch,
  onReset,
}: {
  state: DemoState;
  checks: Check[];
  onSwitch: (p: Partial<DemoState["switches"]>) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sw = state.switches;
  const active = Number(!sw.assume_breach) + Number(Boolean(sw.layer_off)) + Number(sw.audit_down);
  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)} pressed={open}>
        Controls{active > 0 && <span className="rounded-full bg-flag px-1.5 text-[11px] text-white">{active}</span>}
      </Button>
      {open && (
        <>
          <button aria-label="Close controls" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-lg border border-gray-300 bg-white p-2">
            <Switch
              label="Assume breach"
              hint="Force the model to follow every attack, as if fully fooled."
              on={sw.assume_breach}
              onChange={(v) => onSwitch({ assume_breach: v })}
            />
            <div className="px-2 py-2">
              <label htmlFor="layer-off" className="block text-[14px] font-semibold">
                Switch off one check
              </label>
              <span className="block text-[12.5px] leading-snug text-ink-2">Shows the next layer still catches the attack.</span>
              <select
                id="layer-off"
                value={sw.layer_off ?? ""}
                onChange={(e) => onSwitch({ layer_off: e.target.value || null })}
                className="mt-1.5 w-full rounded-md border border-rule bg-paper px-2 py-1.5 text-[14px]"
              >
                <option value="">All checks on</option>
                {checks.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <Switch
              label="Audit log down"
              hint="Sudibran pauses payments when it can't record them (R4)."
              on={sw.audit_down}
              onChange={(v) => onSwitch({ audit_down: v })}
            />
            <div className="mt-1 border-t border-rule px-2 pt-2">
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  onReset();
                }}
              >
                Reset session
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
