"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isoTime } from "@/lib/time";
import type { AuditRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { RiskChip, StatusChip } from "@/components/chips";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

const RISKS = ["", "read", "write", "outbound", "exec"] as const;
const STATUSES = ["", "pending", "ok", "error", "denied", "queued"] as const;

interface Filters {
  risk: string;
  status: string;
  tool: string;
  source: string;
}

const EMPTY_FILTERS: Filters = { risk: "", status: "", tool: "", source: "" };

function auditPath(filters: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.tool.trim()) params.set("tool", filters.tool.trim());
  if (filters.risk) params.set("risk", filters.risk);
  if (filters.status) params.set("status", filters.status);
  if (filters.source.trim()) params.set("source", filters.source.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return `/audit?${params.toString()}`;
}

export default function AuditPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filter changes (debounced for the text inputs) reset to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .get<AuditRow[]>(auditPath(filters, 0))
        .then((data) => {
          setRows(data);
          setExhausted(data.length < PAGE_SIZE);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  const loadMore = () => {
    setLoading(true);
    api
      .get<AuditRow[]>(auditPath(filters, rows.length))
      .then((data) => {
        setRows((current) => [...current, ...data]);
        setExhausted(data.length < PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader title="Audit" meta="Every tool call, recorded before it runs" />

      <div className="fade-up mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="micro-label mb-1 block" htmlFor="audit-risk">
            Risk
          </label>
          <select
            id="audit-risk"
            className="field w-32"
            value={filters.risk}
            onChange={(e) => setFilter("risk", e.target.value)}
          >
            {RISKS.map((risk) => (
              <option key={risk} value={risk}>
                {risk || "all"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="micro-label mb-1 block" htmlFor="audit-status">
            Status
          </label>
          <select
            id="audit-status"
            className="field w-32"
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status || "all"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="micro-label mb-1 block" htmlFor="audit-tool">
            Tool
          </label>
          <input
            id="audit-tool"
            className="field w-44 font-mono"
            placeholder="e.g. shell_exec"
            value={filters.tool}
            onChange={(e) => setFilter("tool", e.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <label className="micro-label mb-1 block" htmlFor="audit-source">
            Source
          </label>
          <input
            id="audit-source"
            className="field w-44 font-mono"
            placeholder="cli / telegram / ws"
            value={filters.source}
            onChange={(e) => setFilter("source", e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="fade-up border border-line px-5">
          <EmptyState glyph="§" message="No audit entries match. The trail starts with the first tool call." />
        </div>
      ) : (
        <div className="fade-up overflow-x-auto border border-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Source</th>
                <th>Tool</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{isoTime(row.ts)}</td>
                  <td>{row.source}</td>
                  <td className="font-medium">{row.tool}</td>
                  <td>
                    <RiskChip risk={row.risk} />
                  </td>
                  <td>
                    <StatusChip status={row.status} />
                  </td>
                  <td
                    className="max-w-[320px] truncate text-ink-60"
                    title={row.result_summary ?? undefined}
                  >
                    {row.result_summary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!exhausted && rows.length > 0 ? (
        <div className="mt-4">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </>
  );
}
