import type { Db } from "./db.js";
import type { Risk } from "./toolTypes.js";

export type AuditStatus = "pending" | "ok" | "error" | "denied" | "queued";

export interface AuditRow {
  id: number;
  ts: number;
  source: string;
  tool: string;
  args_json: string;
  risk: Risk;
  status: AuditStatus;
  result_summary: string | null;
}

const SUMMARY_MAX = 500;

export function truncateSummary(text: string): string {
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/** Written BEFORE tool execution — this is the invariant the whole audit trail rests on. */
export function recordAuditStart(
  db: Db,
  entry: { source: string; tool: string; args: unknown; risk: Risk },
): number {
  const result = db
    .prepare(
      `INSERT INTO audit (ts, source, tool, args_json, risk, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    )
    .run(Date.now(), entry.source, entry.tool, JSON.stringify(entry.args ?? {}), entry.risk);
  return Number(result.lastInsertRowid);
}

export function finishAudit(db: Db, id: number, status: AuditStatus, resultSummary: string): void {
  db.prepare(`UPDATE audit SET status = ?, result_summary = ? WHERE id = ?`).run(
    status,
    truncateSummary(resultSummary),
    id,
  );
}

export interface AuditFilter {
  tool?: string;
  risk?: Risk;
  status?: AuditStatus;
  source?: string;
  limit?: number;
  offset?: number;
}

export function listAudit(db: Db, filter: AuditFilter = {}): AuditRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.tool) {
    clauses.push("tool = ?");
    params.push(filter.tool);
  }
  if (filter.risk) {
    clauses.push("risk = ?");
    params.push(filter.risk);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.source) {
    clauses.push("source = ?");
    params.push(filter.source);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return db
    .prepare(`SELECT * FROM audit ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params) as AuditRow[];
}
