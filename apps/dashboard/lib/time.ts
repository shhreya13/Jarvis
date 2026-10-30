/** Time helpers. Gateway timestamps are epoch milliseconds. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const delta = Date.now() - ts;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 30 * DAY) return `${Math.floor(delta / DAY)}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

/** Compact ISO form for dense tables: 2026-07-24 09:31:02 */
export function isoTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

export function isoDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}
