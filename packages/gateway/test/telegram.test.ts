import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { z } from "zod";
import {
  ApprovalBroker,
  defaultConfig,
  listAudit,
  openDb,
  type Db,
  type ModelStreamFn,
  type ToolDefinition,
} from "@jarvis/core";
import type { GatewayDeps } from "../src/deps.js";
import { createTelegram } from "../src/telegram.js";

const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: "jarvis",
  username: "jarvis_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

interface OutboundCall {
  method: string;
  payload: Record<string, unknown>;
}

interface Harness {
  deps: GatewayDeps;
  db: Db;
  bot: Bot;
  outbound: OutboundCall[];
}

const fakeWebhookTool: ToolDefinition<{ url: string }> = {
  name: "webhook_post",
  description: "Fake webhook tool for approval-replay tests.",
  risk: "outbound",
  schema: z.object({ url: z.string() }),
  execute: async () => "posted",
};

/** Offline grammY bot + hand-built deps; every API call is captured, none hit HTTP. */
function makeHarness(): Harness {
  const db = openDb(":memory:");
  const base = defaultConfig();
  const config = { ...base, telegram: { ...base.telegram, chatId: "777" } };
  const broker = new ApprovalBroker(db);

  const streamFn: ModelStreamFn = async function* scripted() {
    yield { type: "text-delta", text: "hello from jarvis" };
    yield { type: "finish", finishReason: "stop" };
  };

  const deps: GatewayDeps = {
    db,
    config,
    broker,
    tools: [fakeWebhookTool],
    streamFn,
    skillInstructions: () => [],
    channels: new Map(),
    events: new EventEmitter(),
  };

  const bot = new Bot("test-token", { botInfo: BOT_INFO });
  const outbound: OutboundCall[] = [];
  bot.api.config.use((_prev, method, payload) => {
    outbound.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true as const, result: {} as never });
  });

  return { deps, db, bot, outbound };
}

let nextUpdateId = 0;

function textUpdate(
  chatId: number,
  text: string,
  entities?: { type: "bot_command"; offset: number; length: number }[],
): Update {
  nextUpdateId += 1;
  return {
    update_id: nextUpdateId,
    message: {
      message_id: nextUpdateId,
      date: 1_767_600_000,
      chat: { id: chatId, type: "private", first_name: "A" },
      from: { id: chatId, is_bot: false, first_name: "A" },
      text,
      ...(entities ? { entities } : {}),
    },
  };
}

function callbackUpdate(data: string): Update {
  nextUpdateId += 1;
  return {
    update_id: nextUpdateId,
    callback_query: {
      id: "cb1",
      from: { id: 777, is_bot: false, first_name: "A" },
      chat_instance: "ci",
      data,
      message: {
        message_id: 5,
        date: 1_767_600_000,
        chat: { id: 777, type: "private", first_name: "A" },
        text: "Approval needed",
      },
    },
  };
}

/** Lets fire-and-forget listeners (broker "pending" → sendMessage) settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function sendMessages(outbound: OutboundCall[]): OutboundCall[] {
  return outbound.filter((c) => c.method === "sendMessage");
}

describe("telegram", () => {
  it("full chat round-trip", async () => {
    const { deps, bot, outbound } = makeHarness();
    createTelegram(deps, bot);

    await bot.handleUpdate(textUpdate(777, "hi"));

    const replies = sendMessages(outbound);
    expect(replies.length).toBeGreaterThan(0);
    const reply = replies.find((c) => String(c.payload.text).includes("hello from jarvis"));
    expect(reply).toBeDefined();
    expect(String(reply?.payload.chat_id)).toBe("777");
  });

  it("ignores messages from other chats", async () => {
    const { deps, bot, outbound } = makeHarness();
    createTelegram(deps, bot);

    await bot.handleUpdate(textUpdate(999, "hi"));

    expect(sendMessages(outbound)).toHaveLength(0);
  });

  it("/brief replies with the brief", async () => {
    const { deps, bot, outbound } = makeHarness();
    createTelegram(deps, bot);

    await bot.handleUpdate(
      textUpdate(777, "/brief", [{ type: "bot_command", offset: 0, length: 6 }]),
    );

    const reply = sendMessages(outbound).find((c) =>
      String(c.payload.text).includes("Daily brief"),
    );
    expect(reply).toBeDefined();
    expect(String(reply?.payload.text)).toContain("Pending approvals");
  });

  it("approval flow via inline buttons", async () => {
    const { deps, db, bot, outbound } = makeHarness();
    createTelegram(deps, bot);

    const row = deps.broker.create({
      tool: "webhook_post",
      args: { url: "https://x" },
      source: "ws",
      risk: "outbound",
    });
    await flush();

    const prompt = sendMessages(outbound).find((c) =>
      JSON.stringify(c.payload.reply_markup ?? {}).includes(`approve:${row.id}`),
    );
    expect(prompt).toBeDefined();
    expect(String(prompt?.payload.text)).toContain("Approval needed");
    expect(String(prompt?.payload.text)).toContain("webhook_post");

    await bot.handleUpdate(callbackUpdate(`approve:${row.id}`));

    const updated = deps.broker.get(row.id);
    expect(updated?.status).not.toBe("pending");
    expect(["approved", "executed"]).toContain(updated?.status);
    expect(outbound.some((c) => c.method === "answerCallbackQuery")).toBe(true);

    const okRows = listAudit(db, { tool: "webhook_post", status: "ok" });
    expect(okRows).toHaveLength(1);
  });

  it("denial", async () => {
    const { deps, db, bot, outbound } = makeHarness();
    createTelegram(deps, bot);

    const row = deps.broker.create({
      tool: "webhook_post",
      args: { url: "https://x" },
      source: "ws",
      risk: "outbound",
    });
    await flush();

    await bot.handleUpdate(callbackUpdate(`deny:${row.id}`));

    expect(deps.broker.get(row.id)?.status).toBe("denied");
    expect(outbound.some((c) => c.method === "answerCallbackQuery")).toBe(true);
    expect(listAudit(db, { tool: "webhook_post", status: "ok" })).toHaveLength(0);
  });
});
