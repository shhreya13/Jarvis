/** Human-readable hints for common 5-field cron patterns. */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(value: string): string {
  return value.padStart(2, "0");
}

function timeOf(minute: string, hour: string): string | null {
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return null;
  if (Number(minute) > 59 || Number(hour) > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function weekdayName(field: string): string | null {
  if (/^\d$/.test(field) && Number(field) <= 6) return WEEKDAYS[Number(field)] ?? null;
  return null;
}

/**
 * Translates common cron patterns into plain language.
 * Returns null when the pattern is not one of the recognized shapes —
 * callers should then show the raw expression only.
 */
export function cronToHuman(expression: string): string | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];

  if (month !== "*") return null;

  // Every minute / every N minutes
  if (hour === "*" && dom === "*" && dow === "*") {
    if (minute === "*") return "every minute";
    const step = /^\*\/(\d+)$/.exec(minute);
    if (step) return `every ${step[1]} minutes`;
    if (/^\d{1,2}$/.test(minute)) return `hourly at :${pad(minute)}`;
    return null;
  }

  // Every N hours
  if (dom === "*" && dow === "*") {
    const hourStep = /^\*\/(\d+)$/.exec(hour);
    if (hourStep && minute === "0") return `every ${hourStep[1]} hours`;
    const time = timeOf(minute, hour);
    if (time) return `daily at ${time}`;
    return null;
  }

  // Weekly shapes
  if (dom === "*" && dow !== "*") {
    const time = timeOf(minute, hour);
    if (!time) return null;
    if (dow === "1-5") return `weekdays at ${time}`;
    if (dow === "0,6" || dow === "6,0") return `weekends at ${time}`;
    const day = weekdayName(dow);
    if (day) return `${day}s at ${time}`;
    return null;
  }

  // Monthly on day D
  if (dow === "*" && /^\d{1,2}$/.test(dom)) {
    const time = timeOf(minute, hour);
    if (time) return `monthly on day ${dom} at ${time}`;
  }

  return null;
}
