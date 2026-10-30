import type { Risk } from "@/lib/types";

const RISK_CLASS: Record<Risk, string> = {
  read: "chip-read",
  write: "chip-write",
  outbound: "chip-outbound",
  exec: "chip-exec",
};

export function RiskChip({ risk }: { risk: Risk }) {
  return <span className={`chip ${RISK_CLASS[risk] ?? "chip-neutral"}`}>{risk}</span>;
}

const STATUS_CLASS: Record<string, string> = {
  ok: "chip-ok",
  error: "chip-error",
  denied: "chip-denied",
  pending: "chip-pending",
  queued: "chip-queued",
  approved: "chip-ok",
  executed: "chip-ok",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_CLASS[status] ?? "chip-neutral"}`}>{status}</span>
  );
}
