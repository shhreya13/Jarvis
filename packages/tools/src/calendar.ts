import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { z } from "zod";
import type { Config, ToolDefinition } from "@jarvis/core";
import { getGoogleAuth } from "./google.js";
import { toolSchema } from "./schema.js";

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TODAY_MAX_EVENTS = 50;

function calendarClient(config: Config): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: getGoogleAuth(config) });
}

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be an ISO 8601 date/time string",
  });

const calendarReadSchema = z.object({
  timeMin: isoDateTime.optional().describe("Earliest event time, ISO 8601 (defaults to now)"),
  timeMax: isoDateTime
    .optional()
    .describe("Latest event time, ISO 8601 (defaults to 7 days from now)"),
  maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum events to return (1-50)"),
});
type CalendarReadArgs = z.infer<typeof calendarReadSchema>;

function formatEvent(event: calendar_v3.Schema$Event): string {
  const start = event.start?.dateTime ?? event.start?.date ?? "(no start time)";
  const summary = event.summary ?? "(no title)";
  return event.location ? `${start} — ${summary} (${event.location})` : `${start} — ${summary}`;
}

async function listEvents(
  config: Config,
  timeMin: string,
  timeMax: string,
  maxResults: number,
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = calendarClient(config);
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items ?? [];
}

export const calendarReadTool: ToolDefinition<CalendarReadArgs> = {
  name: "calendar_read",
  description:
    "Read events from the user's primary Google Calendar, ordered by start time " +
    "(defaults to the next 7 days). Use for questions about the user's schedule, availability, " +
    "or upcoming meetings. Read-only; requires Google authentication (run `jarvis google-auth` once).",
  risk: "read",
  schema: toolSchema(calendarReadSchema),
  execute: async (args, ctx) => {
    const now = new Date();
    const timeMin = args.timeMin ?? now.toISOString();
    const timeMax =
      args.timeMax ?? new Date(now.getTime() + DEFAULT_WINDOW_DAYS * MS_PER_DAY).toISOString();
    const events = await listEvents(ctx.config, timeMin, timeMax, args.maxResults);
    if (events.length === 0) return `No calendar events between ${timeMin} and ${timeMax}.`;
    return events.map(formatEvent).join("\n");
  },
};

/** Today's formatted agenda (local midnight to midnight). Used by the Phase-2 daily brief. */
export async function todaysEvents(config: Config): Promise<string> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  const events = await listEvents(config, start.toISOString(), end.toISOString(), TODAY_MAX_EVENTS);
  if (events.length === 0) return "No events on today's calendar.";
  return events.map(formatEvent).join("\n");
}
