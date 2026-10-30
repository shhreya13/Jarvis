import { z } from "zod";
import type { ToolDefinition } from "@jarvis/core";

const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARS = 2_000;

const webhookPostSchema = z.object({
  url: z.string().url().describe("Webhook URL; must match a configured webhookWhitelist prefix"),
  payload: z.record(z.unknown()).describe("JSON object to POST as the request body"),
});
type WebhookPostArgs = z.infer<typeof webhookPostSchema>;

export const webhookPostTool: ToolDefinition<WebhookPostArgs> = {
  name: "webhook_post",
  description:
    "POST a JSON payload to a pre-approved webhook URL (Slack, Discord, home automation, CI, ...). " +
    "The URL must start with one of the prefixes in webhookWhitelist in ~/.jarvis/config.json; " +
    "any other destination is refused. Use to push notifications or trigger external automations.",
  risk: "outbound",
  schema: webhookPostSchema,
  validate: (args, ctx) => {
    const whitelist = ctx.config.webhookWhitelist;
    if (whitelist.length === 0) {
      return (
        "webhook_post is disabled because webhookWhitelist is empty. Add allowed URL prefixes to " +
        'the "webhookWhitelist" array in ~/.jarvis/config.json ' +
        '(e.g. ["https://hooks.slack.com/services/"]) to enable it.'
      );
    }
    if (!whitelist.some((prefix) => args.url.startsWith(prefix))) {
      return (
        `URL not allowed: ${args.url} does not start with any webhookWhitelist prefix ` +
        `(configured: ${whitelist.join(", ")}).`
      );
    }
    return undefined;
  },
  execute: async (args) => {
    const response = await fetch(args.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const text = await response.text();
    const body =
      text.length > MAX_RESPONSE_CHARS
        ? `${text.slice(0, MAX_RESPONSE_CHARS)}\n\n[Response truncated at ${MAX_RESPONSE_CHARS} characters]`
        : text;
    return `HTTP ${response.status} ${response.statusText}${body ? `\n\n${body}` : ""}`;
  },
};
