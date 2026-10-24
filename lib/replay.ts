"use client";
import { useEffect, useRef, useState } from "react";

export const STEP_MS = 420;

/**
 * Replays a run's events one at a time so the graph animates as if live.
 * Returns how many events are visible. A new `key` restarts from zero; a larger
 * `total` under the same key (e.g. approval events) continues where it left off.
 */
export function useReplay(total: number, key: string | null, stepMs = STEP_MS): number {
  const [shown, setShown] = useState({ key, n: 0 });
  const nRef = useRef(0);
  const keyRef = useRef<string | null>(null);
  if (shown.key !== key) setShown({ key, n: 0 });

  useEffect(() => {
    if (!key) return;
    if (keyRef.current !== key) {
      keyRef.current = key;
      nRef.current = 0;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      nRef.current = total;
      setShown({ key, n: total });
      return;
    }
    if (nRef.current >= total) return;
    const id = window.setInterval(() => {
      nRef.current += 1;
      setShown({ key, n: nRef.current });
      if (nRef.current >= total) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [key, total, stepMs]);

  return shown.key === key ? Math.min(shown.n, total) : 0;
}
