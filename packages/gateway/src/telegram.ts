import { Bot, InlineKeyboard, type Context } from "grammy";
import {
  executeApprovedAction,
  getOrCreateChannelSession,
  runAgentTurn,
  type ApprovalRow,
} from "@jarvis/core";
import type { ChannelSender, GatewayDeps } from "./deps.js";
import { composeBrief } from "./brief.js";

/** Telegram hard limit is 4096; stay comfortably below it. */
const MAX_CHUNK_CHARS = 4000;
const ARGS_PREVIEW_MAX = 300;

export interface TelegramHandle {
  bot: Bot;
  sender: ChannelSender;
  stop: () => Promise<void>;
  start: () => Promise<void>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function capJson(value: unknown, max: number): string {
  const json = JSON.stringify(value ?? {});
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}

function chunkText(text: string): string[] {
  const safe = text.length > 0 ? text : "(no reply)";
  const chunks: string[] = [];
  for (let i = 0; i < safe.length; i += MAX_CHUNK_CHARS) {
    chunks.push(safe.slice(i, i + MAX_CHUNK_CHARS));
  }
  return chunks;
}

async function replyChunked(ctx: Context, text: string): Promise<void> {
  for (const chunk of chunkText(text)) {
    await ctx.reply(chunk);
  }
}

/**
 * Wires the Telegram channel: single-chat security gate, /brief, chat turns,
 * and out-of-band approval buttons. Does NOT start long polling — call
 * `handle.start()` (the daemon does).
 */
export function createTelegram(
  deps: GatewayDeps,
  botOverride?: Bot,
  log: (msg: string) => void = () => {},
): TelegramHandle {
  const tokenEnv = deps.config.telegram.botTokenEnv;
  const token = process.env[tokenEnv];
  if (!botOverride && (!token || token.length === 0)) {
    throw new Error(
      `Telegram bot token missing: set the ${tokenEnv} environment variable ` +
        `(configured via telegram.botTokenEnv).`,
    );
  }
  const bot = botOverride ?? new Bot(token as string);

  // ---- security gate: only the configured chat may interact ----
  const discoveryPrompted = new Set<number>();
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id;
    const configured = deps.config.telegram.chatId;
    if (configured === "") {
      // Help the owner discover their chat id, once, for private text messages.
      if (
        ctx.chat?.type === "private" &&
        typeof ctx.message?.text === "string" &&
        chatId !== undefined &&
        !discoveryPrompted.has(chatId)
      ) {
        discoveryPrompted.add(chatId);
        await ctx.reply(`Set telegram.chatId in config to your chat id: ${chatId}`);
      }
      return;
    }
    if (chatId === undefined || String(chatId) !== configured) return;
    await next();
  });

  // ---- commands ----
  const helpText =
    "I'm Jarvis — your personal AI agent. Send me a message and I'll answer, " +
    "using my tools (files, shell, web, Gmail, calendar) when needed; risky " +
    "actions always wait for your approval.\n\n" +
    "Commands:\n/brief — today's daily brief\n/help — this message";

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(helpText);
  });

  bot.command("brief", async (ctx) => {
    try {
      await replyChunked(ctx, await composeBrief(deps));
    } catch (err) {
      await ctx.reply(`⚠️ ${errorMessage(err)}`);
    }
  });

  // ---- approval buttons ----
  bot.on("callback_query:data", async (ctx) => {
    const match = /^(approve|deny):(.+)$/.exec(ctx.callbackQuery.data);
    if (!match) {
      await ctx.answerCallbackQuery("Unknown action");
      return;
    }
    const verb = match[1] as "approve" | "deny";
    const id = match[2] as string;

    const row = deps.broker.get(id);
    if (!row || row.status !== "pending") {
      await ctx.answerCallbackQuery("Already handled");
      return;
    }

    // Snapshot BEFORE decide — decide() resumes a live waiter synchronously.
    const hadWaiter = deps.broker.hasWaiter(id);
    deps.broker.decide(id, verb === "approve");

    let suffix: string;
    let answer: string;
    if (verb === "approve") {
      if (hadWaiter) {
        suffix = "→ Approved ✅";
        answer = "Approved";
      } else {
        const outcome = await executeApprovedAction({
          db: deps.db,
          config: deps.config,
          tools: deps.tools,
          broker: deps.broker,
          source: "telegram",
          approvalId: id,
        });
        suffix = `→ Approved ✅ (ran: ${outcome.status})`;
        answer = `Approved — ${outcome.status}`;
      }
    } else {
      suffix = "→ Denied ❌";
      answer = "Denied";
    }

    await ctx.answerCallbackQuery(answer);
    try {
      const message = ctx.callbackQuery.message;
      const original =
        message && "text" in message && typeof message.text === "string"
          ? message.text
          : "Approval needed";
      await ctx.editMessageText(`${original}\n\n${suffix}`);
    } catch (err) {
      log(`telegram: could not edit approval message: ${errorMessage(err)}`);
    }
  });

  // ---- chat turns ----
  bot.on("message:text", async (ctx) => {
    const userText = ctx.message.text;
    if (userText.startsWith("/")) return; // unmatched commands are not chat input
    try {
      const session = getOrCreateChannelSession(deps.db, "telegram");
      const reply = await runAgentTurn({
        db: deps.db,
        config: deps.config,
        tools: deps.tools,
        streamFn: deps.streamFn,
        broker: deps.broker,
        source: "telegram",
        sessionId: session.id,
        userText,
        skillInstructions: deps.skillInstructions(),
        // NOT Infinity: approval buttons resolve out-of-band; queued is fine.
        approvalTimeoutMs: deps.config.approvalTimeoutMs,
      });
      await replyChunked(ctx, reply);
    } catch (err) {
      await ctx.reply(`⚠️ ${errorMessage(err)}`);
    }
  });

  bot.catch((err) => {
    log(`telegram handler error: ${errorMessage(err)}`);
  });

  // ---- approval notifications (broker → chat with inline buttons) ----
  const notifyApproval = async (row: ApprovalRow): Promise<void> => {
    const chatId = deps.config.telegram.chatId;
    if (chatId === "") {
      log("telegram: telegram.chatId not configured; cannot send approval prompt");
      return;
    }
    const action = deps.broker.parseAction(row);
    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve:${row.id}`)
      .text("❌ Deny", `deny:${row.id}`);
    await bot.api.sendMessage(
      chatId,
      `Approval needed\n${action.tool}\n${capJson(action.args, ARGS_PREVIEW_MAX)}\nrisk: ${action.risk}`,
      { reply_markup: keyboard },
    );
  };
  const onPending = (row: ApprovalRow): void => {
    void notifyApproval(row).catch((err) => {
      log(`telegram: approval notification failed: ${errorMessage(err)}`);
    });
  };
  deps.broker.on("pending", onPending);

  // ---- outbound channel sender ----
  const sender: ChannelSender = async (text) => {
    const chatId = deps.config.telegram.chatId;
    if (chatId === "") {
      log("telegram sender: telegram.chatId not configured; dropping message");
      return;
    }
    for (const chunk of chunkText(text)) {
      await bot.api.sendMessage(chatId, chunk);
    }
  };

  const start = async (): Promise<void> => {
    // Long polling never resolves while running — fire and forget, log failures.
    void bot.start({ drop_pending_updates: true }).catch((err) => {
      log(`telegram polling stopped: ${errorMessage(err)}`);
    });
  };

  const stop = async (): Promise<void> => {
    deps.broker.off("pending", onPending);
    await bot.stop();
  };

  return { bot, sender, stop, start };
}
