"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { parseAction, type ApprovalRow } from "@/lib/types";
import { relativeTime } from "@/lib/time";
import { RiskChip } from "./chips";

export function prettyArgs(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/**
 * A pending approval, decidable in place. `compact` renders the overview
 * variant; the default is the full approvals-queue card.
 */
export function ApprovalCard({
  row,
  compact = false,
  onDecided,
}: {
  row: ApprovalRow;
  compact?: boolean;
  onDecided?: (id: string, approved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = parseAction(row);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/approvals/${row.id}`, { approve });
      onDecided?.(row.id, approve);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`slide-in border border-signal/50 bg-paper ${compact ? "p-3" : "p-5"}`}
      aria-label={`Pending approval: ${action.tool}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-mono font-medium ${compact ? "text-[13px]" : "text-[15px]"}`}>
          {action.tool}
        </span>
        <RiskChip risk={action.risk} />
        <span className="font-mono text-[11px] text-ink-60">via {action.source}</span>
        <span className="ml-auto font-mono text-[11px] text-ink-60">
          {relativeTime(row.created_at)}
        </span>
      </div>

      <pre
        className={`mt-3 overflow-x-auto border border-line bg-paper-2/70 p-3 font-mono text-ink ${
          compact ? "max-h-24 text-[11px]" : "max-h-56 text-[12px]"
        }`}
      >
        {prettyArgs(action.args)}
      </pre>

      {error ? <p className="mt-2 text-[12px] text-signal">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`btn btn-approve ${compact ? "" : "px-6"}`}
          disabled={busy}
          onClick={() => decide(true)}
        >
          Approve
        </button>
        <button
          type="button"
          className={`btn btn-deny ${compact ? "" : "px-6"}`}
          disabled={busy}
          onClick={() => decide(false)}
        >
          Deny
        </button>
      </div>
    </article>
  );
}
