import type { AuditEvent } from "./types";

// One canonical serialisation, shared by the server (node:crypto) and the
// browser (crypto.subtle), so the evidence viewer can re-check the chain itself.
export function canonical(e: Omit<AuditEvent, "hash">): string {
  return JSON.stringify([
    e.seq,
    e.time,
    e.run_id,
    e.step,
    e.layer,
    e.mechanism,
    e.node,
    e.edge,
    e.decision,
    e.reason,
    e.rule ?? null,
    e.off ?? false,
    e.actor,
    e.labels,
    e.payment_id,
    e.prev_hash,
  ]);
}

export const GENESIS = "0".repeat(64);

export async function sha256Browser(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Checks each event's hash, and its link to the event before it when the two are
 * adjacent in the chain (a run's approval events can land after other runs).
 * Returns the first broken seq.
 */
export async function verifyInBrowser(events: AuditEvent[]): Promise<{ intact: boolean; broken_at: number | null }> {
  for (let i = 0; i < events.length; i++) {
    const { hash, ...rest } = events[i];
    if ((await sha256Browser(canonical(rest))) !== hash) return { intact: false, broken_at: events[i].seq };
    const prev = events[i - 1];
    if (prev && prev.seq === events[i].seq - 1 && events[i].prev_hash !== prev.hash) {
      return { intact: false, broken_at: events[i].seq };
    }
  }
  return { intact: true, broken_at: null };
}
