import { countUnread, todaysEvents } from "@jarvis/tools";
import type { GatewayDeps } from "./deps.js";

const ARGS_PREVIEW_MAX = 120;
const APPROVAL_ID_PREVIEW = 8;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatDate(now: Date): string {
  const weekday = WEEKDAYS[now.getDay()] ?? "";
  const month = MONTHS[now.getMonth()] ?? "";
  return `${weekday}, ${month} ${now.getDate()}, ${now.getFullYear()}`;
}

function capJson(value: unknown, max: number): string {
  const json = JSON.stringify(value ?? {});
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}

/**
 * Deterministic daily brief: calendar + unread mail + pending approvals.
 * Google sections degrade gracefully when OAuth isn't configured; no model call.
 */
export async function composeBrief(deps: GatewayDeps): Promise<string> {
  const lines: string[] = [`☀️ Daily brief — ${formatDate(new Date())}`, ""];

  lines.push("📅 Today");
  try {
    lines.push(await todaysEvents(deps.config));
  } catch {
    lines.push("Calendar not connected (run `jarvis google-auth`)");
  }

  lines.push("", "📧 Unread");
  try {
    const unread = await countUnread(deps.config);
    lines.push(`${unread} unread email${unread === 1 ? "" : "s"} in the inbox`);
  } catch {
    lines.push("Gmail not connected");
  }

  lines.push("", "⏳ Pending approvals");
  const pending = deps.broker.listPending();
  if (pending.length === 0) {
    lines.push("None");
  } else {
    for (const row of pending) {
      const action = deps.broker.parseAction(row);
      lines.push(
        `${action.tool} — ${capJson(action.args, ARGS_PREVIEW_MAX)} (id ${row.id.slice(0, APPROVAL_ID_PREVIEW)})`,
      );
    }
  }

  return lines.join("\n");
}
