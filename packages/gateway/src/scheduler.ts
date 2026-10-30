import { Cron } from "croner";
import { createSession, runAgentTurn } from "@jarvis/core";
import type { GatewayDeps } from "./deps.js";
import { getJob, listJobs, seedDefaultJobs } from "./jobsStore.js";
import { composeBrief } from "./brief.js";

export interface SchedulerHandle {
  reload: () => void;
  stop: () => void;
  running: () => string[];
  runJobNow: (id: string) => Promise<void>;
}

/**
 * Cron scheduler for stored jobs. "@brief" prompts compose the deterministic
 * daily brief (no model call); anything else runs a fresh agent session.
 * Job failures are logged and broadcast — they never crash the process.
 */
export function startScheduler(
  deps: GatewayDeps,
  opts: { log?: (msg: string) => void } = {},
): SchedulerHandle {
  const log = opts.log ?? ((): void => {});
  const crons = new Map<string, Cron>();

  const runJob = async (id: string): Promise<void> => {
    try {
      const job = getJob(deps.db, id);
      if (!job || !job.enabled) return;

      let text: string;
      if (job.prompt.trim() === "@brief") {
        text = await composeBrief(deps);
      } else {
        const session = createSession(deps.db, `job:${id}`);
        text = await runAgentTurn({
          db: deps.db,
          config: deps.config,
          tools: deps.tools,
          streamFn: deps.streamFn,
          broker: deps.broker,
          source: `job:${id}`,
          sessionId: session.id,
          userText: job.prompt,
          skillInstructions: deps.skillInstructions(),
          approvalTimeoutMs: deps.config.approvalTimeoutMs,
        });
      }

      const send = deps.channels.get(job.channel);
      if (send) {
        await send(text);
      } else {
        log(`job ${id}: channel ${job.channel} unavailable, output:\n${text}`);
      }
      deps.events.emit("broadcast", { type: "job-ran", id, ok: true });
    } catch (err) {
      log(`job ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      deps.events.emit("broadcast", { type: "job-ran", id, ok: false });
    }
  };

  const stopCrons = (): void => {
    for (const cron of crons.values()) cron.stop();
    crons.clear();
  };

  const schedule = (): void => {
    for (const job of listJobs(deps.db, true)) {
      crons.set(
        job.id,
        new Cron(job.cron, () => {
          void runJob(job.id);
        }),
      );
    }
  };

  const reload = (): void => {
    stopCrons();
    schedule();
  };

  seedDefaultJobs(deps.db);
  schedule();
  deps.events.on("jobs-changed", reload);

  return {
    reload,
    stop: (): void => {
      deps.events.off("jobs-changed", reload);
      stopCrons();
    },
    running: (): string[] => [...crons.keys()],
    runJobNow: runJob,
  };
}
