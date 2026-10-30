import type { FastifyInstance } from "fastify";
import { requireToken } from "@jarvis/core";
import { createDeps, type GatewayDeps } from "./deps.js";
import { buildServer } from "./server.js";
import { createTelegram, type TelegramHandle } from "./telegram.js";
import { startScheduler, type SchedulerHandle } from "./scheduler.js";
import { attachSkills } from "./skillsRuntime.js";

export interface Daemon {
  app: FastifyInstance;
  deps: GatewayDeps;
  scheduler: SchedulerHandle;
  telegram?: TelegramHandle;
  url: string;
  stop: () => Promise<void>;
}

export interface StartDaemonOptions {
  deps?: Partial<GatewayDeps>;
  log?: (msg: string) => void;
}

/**
 * Boots the long-running Jarvis daemon: REST/ws gateway (127.0.0.1 by
 * default), Telegram long-polling (if enabled), and the cron scheduler.
 */
export async function startDaemon(options: StartDaemonOptions = {}): Promise<Daemon> {
  const log = options.log ?? ((msg: string) => process.stderr.write(`${msg}\n`));
  const deps = createDeps(options.deps ?? {});
  requireToken();

  const skills = attachSkills(deps);
  const report = skills.reload();
  for (const problem of report.problems) {
    log(`skill problem: ${problem.dir}: ${problem.message}`);
  }
  log(`skills loaded: ${report.loaded.filter((s) => s.enabled).length} enabled`);
  deps.events.on("skills-changed", () => skills.reload());

  const app = buildServer(deps);
  const { host, port } = deps.config.gateway;
  await app.listen({ host, port });
  const url = `http://${host}:${port}`;
  log(`gateway listening on ${url}`);

  let telegram: TelegramHandle | undefined;
  if (deps.config.telegram.enabled) {
    try {
      telegram = createTelegram(deps);
      deps.channels.set("telegram", telegram.sender);
      await telegram.start();
      log("telegram bot started");
    } catch (err) {
      log(`telegram disabled: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const scheduler = startScheduler(deps, { log });
  log(`scheduler running ${scheduler.running().length} job(s)`);

  const stop = async (): Promise<void> => {
    scheduler.stop();
    await telegram?.stop();
    await app.close();
    deps.db.close();
  };

  return { app, deps, scheduler, telegram, url, stop };
}
