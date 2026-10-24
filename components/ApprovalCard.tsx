"use client";
import type { Approval } from "@/lib/types";
import { usd } from "@/lib/labels";
import { Button } from "./ui";

/**
 * R5: drawn by Sudibran from its own records, never by the AI, so the AI can't fake one.
 * The seal row makes that visible to Maya.
 */
export function ApprovalCard({
  approval,
  onDecide,
  busy,
  compact,
}: {
  approval: Approval;
  onDecide: (action: "approve" | "reject") => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const decided = approval.status !== "pending";
  return (
    <div className="overflow-hidden rounded-xl border-2 border-ask-line bg-surface">
      <div className="flex items-center gap-2 bg-ask-wash px-4 py-1.5 text-[12.5px] font-semibold text-ask">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 1 12.5 3v4c0 3-2.4 5.2-5.5 6C3.9 12.2 1.5 10 1.5 7V3L7 1Z" fill="currentColor" />
        </svg>
        Drawn by Sudibran, not by the AI · R5
      </div>
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[15px] font-bold">
            Pay {approval.supplier} <span className="wide">{usd(approval.amount_usd)}</span>
          </p>
          <p className="font-mono text-[13px] text-ink-2">
            to {approval.account_masked} · CRS {approval.crs === "not_needed" ? "not needed" : approval.crs}
          </p>
        </div>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{approval.reason}</p>
        {decided ? (
          <p className={`mt-3 text-[14px] font-semibold ${approval.status === "approved" ? "text-safe" : "text-harm"}`}>
            {approval.status === "approved" ? "You approved this payment." : "You rejected this payment."}
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button variant="safe" onClick={() => onDecide("approve")} disabled={busy}>
              Approve payment
            </Button>
            <Button variant="danger" onClick={() => onDecide("reject")} disabled={busy}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
