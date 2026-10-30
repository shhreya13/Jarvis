import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  ApprovalBroker,
  defaultConfig,
  generateToken,
  openDb,
  listAudit,
  type Config,
  type Db,
  type ModelStreamFn,
  type ToolDefinition,
} from "@jarvis/core";
import { buildServer } from "../src/server.js";
import type { GatewayDeps } from "../src/deps.js";
import { upsertJob } from "../src/jobsStore.js";
import type { FastifyInstance } from "fastify";

let home: string;
let db: Db;
let config: Config;
let broker: ApprovalBroker;
let app: FastifyInstance;
let token: string;
let executions: unknown[];

function scripted(text: string): ModelStreamFn {
  return async function* () {
    yield { type: "text-delta" as const, text };
    yield { type: "finish" as const, finishReason: "stop" };
  };
}

function fakeOutboundTool(): ToolDefinition<{ url: string }> {
  return {
    name: "webhook_post",
    description: "fake",
    risk: "outbound",
    schema: z.object({ url: z.string() }),
    execute: async (args) => {
      executions.push(args);
      return "posted";
    },
  };
}

function authed(headers: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...headers };
}

beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-gw-"));
  process.env.JARVIS_HOME = home;
  process.env.JARVIS_WORKSPACE = path.join(home, "ws");
  token = generateToken();
  db = openDb(":memory:");
  config = defaultConfig();
  broker = new ApprovalBroker(db);
  executions = [];
  const deps: GatewayDeps = {
    db,
    config,
    broker,
    tools: [fakeOutboundTool()],
    streamFn: scripted("gateway says hi"),
    skillInstructions: () => [],
    channels: new Map(),
    events: new EventEmitter(),
  };
  app = buildServer(deps);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(home, { recursive: true, force: true });
  delete process.env.JARVIS_HOME;
  delete process.env.JARVIS_WORKSPACE;
});

describe("auth middleware", () => {
  it("allows /health without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it.each(["/chat", "/approvals", "/memories", "/audit", "/jobs", "/skills", "/config", "/sessions"])(
    "rejects %s without a token",
    async (url) => {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    },
  );

  it("rejects a wrong token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audit",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("REST API", () => {
  it("POST /chat runs a turn and returns the reply", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      headers: authed(),
      payload: { message: "hello" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { reply: string; sessionId: string } };
    expect(body.data.reply).toBe("gateway says hi");
    expect(body.data.sessionId).toMatch(/[0-9a-f-]{36}/);
  });

  it("approval decide endpoint replays queued outbound actions exactly once", async () => {
    const row = broker.create({
      tool: "webhook_post",
      args: { url: "https://hooks.example.com/x" },
      source: "job:t",
      risk: "outbound",
    });
    const res = await app.inject({
      method: "POST",
      url: `/approvals/${row.id}`,
      headers: authed(),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(200);
    expect(executions).toEqual([{ url: "https://hooks.example.com/x" }]);
    expect(listAudit(db)[0]).toMatchObject({ tool: "webhook_post", status: "ok" });

    const again = await app.inject({
      method: "POST",
      url: `/approvals/${row.id}`,
      headers: authed(),
      payload: { approve: true },
    });
    expect(again.statusCode).toBe(409);
    expect(executions).toHaveLength(1);
  });

  it("denying via the endpoint never executes", async () => {
    const row = broker.create({
      tool: "webhook_post",
      args: { url: "https://x" },
      source: "job:t",
      risk: "outbound",
    });
    await app.inject({
      method: "POST",
      url: `/approvals/${row.id}`,
      headers: authed(),
      payload: { approve: false },
    });
    expect(executions).toHaveLength(0);
    expect(broker.get(row.id)!.status).toBe("denied");
  });

  it("jobs CRUD round-trips and validates cron", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/jobs/test-job",
      headers: authed(),
      payload: { cron: "0 9 * * 1", prompt: "weekly summary", channel: "telegram", enabled: true },
    });
    expect(put.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/jobs", headers: authed() });
    expect((list.json() as { data: { id: string }[] }).data.map((j) => j.id)).toContain("test-job");

    const bad = await app.inject({
      method: "PUT",
      url: "/jobs/bad",
      headers: authed(),
      payload: { cron: "not a cron", prompt: "x" },
    });
    expect(bad.statusCode).toBe(500);

    const del = await app.inject({ method: "DELETE", url: "/jobs/test-job", headers: authed() });
    expect(del.statusCode).toBe(200);
  });

  it("memories endpoints list, search and delete", async () => {
    const { remember } = await import("@jarvis/core");
    const m = remember(db, "gateway memory fact about penguins");
    const found = await app.inject({
      method: "GET",
      url: "/memories?query=penguins",
      headers: authed(),
    });
    expect((found.json() as { data: { id: number }[] }).data[0]!.id).toBe(m.id);
    const del = await app.inject({ method: "DELETE", url: `/memories/${m.id}`, headers: authed() });
    expect(del.statusCode).toBe(200);
    const missing = await app.inject({ method: "DELETE", url: "/memories/999", headers: authed() });
    expect(missing.statusCode).toBe(404);
  });

  it("config PUT validates and persists", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/config",
      headers: authed(),
      payload: { webhookWhitelist: ["https://hooks.example.com/"] },
    });
    expect(res.statusCode).toBe(200);
    expect(config.webhookWhitelist).toEqual(["https://hooks.example.com/"]);
    const bad = await app.inject({
      method: "PUT",
      url: "/config",
      headers: authed(),
      payload: { provider: { type: "bogus" } },
    });
    expect(bad.statusCode).toBe(500);
  });

  it("audit endpoint filters by status", async () => {
    upsertJob(db, { id: "j", cron: "0 7 * * *", prompt: "x", channel: "telegram", enabled: true });
    const res = await app.inject({ method: "GET", url: "/audit?status=ok", headers: authed() });
    expect(res.statusCode).toBe(200);
  });
});
