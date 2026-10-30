import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApprovalBroker,
  defaultConfig,
  openDb,
  type Db,
  type ModelStreamFn,
} from "@jarvis/core";
import type { ChannelSender, GatewayDeps } from "../src/deps.js";
import { listJobs, upsertJob } from "../src/jobsStore.js";
import { startScheduler, type SchedulerHandle } from "../src/scheduler.js";

interface Harness {
  deps: GatewayDeps;
  db: Db;
  sent: string[];
  streamCalls: () => number;
}

/** Deps built by hand — no real model, no network, in-memory db. */
function makeHarness(): Harness {
  const db = openDb(":memory:");
  const config = defaultConfig(); // google.clientId "" → brief degrades offline
  const broker = new ApprovalBroker(db);

  let calls = 0;
  const streamFn: ModelStreamFn = async function* scripted() {
    calls += 1;
    yield { type: "text-delta", text: "job output" };
    yield { type: "finish", finishReason: "stop" };
  };

  const sent: string[] = [];
  const telegramSender: ChannelSender = async (text) => {
    sent.push(text);
  };

  const deps: GatewayDeps = {
    db,
    config,
    broker,
    tools: [],
    streamFn,
    skillInstructions: () => [],
    channels: new Map([["telegram", telegramSender]]),
    events: new EventEmitter(),
  };
  return { deps, db, sent, streamCalls: () => calls };
}

/** Pre-populates the jobs table so seedDefaultJobs no-ops with both disabled. */
function disableSeededJobs(db: Db): void {
  upsertJob(db, {
    id: "daily-brief",
    cron: "0 7 * * *",
    prompt: "@brief",
    channel: "telegram",
    enabled: false,
  });
  upsertJob(db, {
    id: "followup-sweep",
    cron: "0 18 * * *",
    prompt: "sweep",
    channel: "telegram",
    enabled: false,
  });
}

describe("scheduler", () => {
  let handle: SchedulerHandle | undefined;

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    vi.useRealTimers();
  });

  it("seeds the two default jobs", () => {
    const { deps, db } = makeHarness();
    handle = startScheduler(deps);

    const jobs = listJobs(db);
    expect(jobs.map((j) => j.id)).toEqual(["daily-brief", "followup-sweep"]);
    const brief = jobs.find((j) => j.id === "daily-brief");
    expect(brief?.cron).toBe("0 7 * * *");
    expect(brief?.prompt).toBe("@brief");

    handle.stop();
    handle = undefined;
  });

  it("fires a job under a mocked clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T06:59:50"));

    const { deps, db, sent } = makeHarness();
    disableSeededJobs(db);
    upsertJob(db, {
      id: "t1",
      cron: "0 7 * * *",
      prompt: "say hi",
      channel: "telegram",
      enabled: true,
    });

    handle = startScheduler(deps);
    expect(handle.running()).toEqual(["t1"]);

    await vi.advanceTimersByTimeAsync(20_000);

    expect(sent).toContain("job output");
  });

  it("@brief jobs bypass the model", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T06:59:50"));

    const { deps, db, sent, streamCalls } = makeHarness();
    disableSeededJobs(db);
    upsertJob(db, {
      id: "b",
      cron: "0 7 * * *",
      prompt: "@brief",
      channel: "telegram",
      enabled: true,
    });

    handle = startScheduler(deps);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(sent).toHaveLength(1);
    expect(sent[0] ?? "").toContain("Daily brief");
    expect(sent[0] ?? "").toContain("Pending approvals");
    expect(streamCalls()).toBe(0);
  });

  it("reload picks up new jobs via jobs-changed event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T06:59:50"));

    const { deps, db, sent } = makeHarness();
    disableSeededJobs(db);

    handle = startScheduler(deps);
    expect(handle.running()).toEqual([]);

    upsertJob(db, {
      id: "late",
      cron: "0 7 * * *",
      prompt: "say hi",
      channel: "telegram",
      enabled: true,
    });
    deps.events.emit("jobs-changed");
    expect(handle.running()).toEqual(["late"]);

    await vi.advanceTimersByTimeAsync(20_000);

    expect(sent).toContain("job output");
  });
});
