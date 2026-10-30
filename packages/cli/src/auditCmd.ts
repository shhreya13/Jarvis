import { listAudit, openDb, type AuditRow, type AuditStatus, type Risk } from "@jarvis/core";

const RISKS: readonly Risk[] = ["read", "write", "outbound", "exec"];
const STATUSES: readonly AuditStatus[] = ["pending", "ok", "error", "denied", "queued"];
const DEFAULT_LIMIT = 50;
const SUMMARY_MAX = 60;

export interface AuditOptions {
  tool?: string;
  risk?: string;
  status?: string;
  source?: string;
  limit?: string;
}

function parseChoice<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined {
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  console.error(`Invalid ${flag} "${value}" — expected one of: ${allowed.join(", ")}`);
  return process.exit(1);
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`Invalid --limit "${value}" — expected a positive integer.`);
    return process.exit(1);
  }
  return parsed;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printTable(rows: AuditRow[]): void {
  const table = rows.map((row) => ({
    ts: new Date(row.ts).toISOString(),
    source: row.source,
    tool: row.tool,
    risk: row.risk as string,
    status: row.status as string,
    summary: truncate(row.result_summary ?? "", SUMMARY_MAX),
  }));
  const widthOf = (values: string[]): number => Math.max(...values.map((v) => v.length));
  const widths = {
    ts: widthOf(table.map((r) => r.ts)),
    source: widthOf(table.map((r) => r.source)),
    tool: widthOf(table.map((r) => r.tool)),
    risk: widthOf(table.map((r) => r.risk)),
    status: widthOf(table.map((r) => r.status)),
  };
  for (const row of table) {
    console.log(
      [
        row.ts.padEnd(widths.ts),
        row.source.padEnd(widths.source),
        row.tool.padEnd(widths.tool),
        row.risk.padEnd(widths.risk),
        row.status.padEnd(widths.status),
        row.summary,
      ].join("  "),
    );
  }
}

export function runAudit(opts: AuditOptions): void {
  const filter = {
    tool: opts.tool,
    risk: parseChoice(opts.risk, RISKS, "--risk"),
    status: parseChoice(opts.status, STATUSES, "--status"),
    source: opts.source,
    limit: parseLimit(opts.limit),
  };
  const db = openDb();
  try {
    const rows = listAudit(db, filter);
    if (rows.length === 0) {
      console.log("No audit entries.");
      return;
    }
    printTable(rows);
  } finally {
    db.close();
  }
}
