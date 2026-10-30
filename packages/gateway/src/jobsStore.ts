import { z } from "zod";
import { Cron } from "croner";
import type { Db } from "@jarvis/core";

export const JobSchema = z.object({
  id: z.string().min(1),
  cron: z.string().min(1).refine(isValidCron, "Invalid cron expression"),
  prompt: z.string().min(1),
  channel: z.string().default("telegram"),
  enabled: z.boolean().default(true),
});

export type Job = z.infer<typeof JobSchema>;

function isValidCron(expression: string): boolean {
  try {
    new Cron(expression, { paused: true }).stop();
    return true;
  } catch {
    return false;
  }
}

interface JobRow {
  id: string;
  cron: string;
  prompt: string;
  channel: string;
  enabled: number;
}

function toJob(row: JobRow): Job {
  return { ...row, enabled: row.enabled === 1 };
}

export function listJobs(db: Db, enabledOnly = false): Job[] {
  const rows = db
    .prepare(`SELECT * FROM jobs ${enabledOnly ? "WHERE enabled = 1" : ""} ORDER BY id`)
    .all() as JobRow[];
  return rows.map(toJob);
}

export function getJob(db: Db, id: string): Job | undefined {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
  return row ? toJob(row) : undefined;
}

export function upsertJob(db: Db, job: Job): void {
  db.prepare(
    `INSERT INTO jobs (id, cron, prompt, channel, enabled) VALUES (@id, @cron, @prompt, @channel, @enabled)
     ON CONFLICT(id) DO UPDATE SET cron=@cron, prompt=@prompt, channel=@channel, enabled=@enabled`,
  ).run({ ...job, enabled: job.enabled ? 1 : 0 });
}

export function deleteJob(db: Db, id: string): boolean {
  return db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id).changes > 0;
}

/**
 * The two stock jobs. "@brief" is handled deterministically by the scheduler
 * (no model call); everything else is an agent prompt.
 */
export function seedDefaultJobs(db: Db): void {
  const count = (db.prepare(`SELECT count(*) AS n FROM jobs`).get() as { n: number }).n;
  if (count > 0) return;
  upsertJob(db, {
    id: "daily-brief",
    cron: "0 7 * * *",
    prompt: "@brief",
    channel: "telegram",
    enabled: true,
  });
  upsertJob(db, {
    id: "followup-sweep",
    cron: "0 18 * * *",
    prompt:
      "Search memory for open follow-ups, commitments, or things I said I would do (search_memory with terms like 'follow up', 'waiting on', 'promised', 'todo'). For each genuine open item, draft a short reminder email to me about it using gmail_create_draft (subject 'Follow-up reminder: …'). These drafts require my approval — that is expected. Finish with a one-paragraph summary of what you found and queued.",
    channel: "telegram",
    enabled: true,
  });
}
