"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isoTime, relativeTime } from "@/lib/time";
import { parseAction, type ApprovalRow } from "@/lib/types";
import { useWs } from "@/lib/ws";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { RiskChip, StatusChip } from "@/components/chips";

export default function ApprovalsPage() {
  const { subscribe, refreshPending } = useWs();
  const [rows, setRows] = useState<ApprovalRow[]>([]);

  const load = useCallback(() => {
    api.get<ApprovalRow[]>("/approvals").then(setRows).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "approval-pending" || event.type === "approval-decided") {
          load();
        }
      }),
    [subscribe, load],
  );

  const pending = rows.filter((row) => row.status === "pending");
  const history = rows.filter((row) => row.status !== "pending");

  return (
    <>
      <PageHeader
        title="Approvals"
        meta={
          pending.length > 0
            ? `${pending.length} action${pending.length === 1 ? "" : "s"} waiting on you`
            : "Every outbound/exec action stops here first"
        }
      />

      <section aria-labelledby="approvals-queue" className="fade-up">
        <h2 id="approvals-queue" className="micro-label mb-3">
          Queue
        </h2>
        {pending.length === 0 ? (
          <div className="border border-line px-5">
            <EmptyState glyph="[ ]" message="Queue clear. Gated actions will land here in real time." />
          </div>
        ) : (
          <div className="stagger space-y-4">
            {pending.map((row) => (
              <ApprovalCard
                key={row.id}
                row={row}
                onDecided={() => {
                  load();
                  refreshPending();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="approvals-history" className="fade-up mt-10">
        <h2 id="approvals-history" className="micro-label mb-3">
          History
        </h2>
        {history.length === 0 ? (
          <div className="border border-line px-5">
            <EmptyState glyph="·" message="No decisions recorded yet." />
          </div>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Risk</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Decided</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const action = parseAction(row);
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{action.tool}</td>
                      <td>
                        <RiskChip risk={action.risk} />
                      </td>
                      <td>{action.source}</td>
                      <td>
                        <StatusChip status={row.status} />
                      </td>
                      <td title={isoTime(row.created_at)}>{relativeTime(row.created_at)}</td>
                      <td>{isoTime(row.decided_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
