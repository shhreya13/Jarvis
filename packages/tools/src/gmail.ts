import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { z } from "zod";
import type { Config, ToolDefinition } from "@jarvis/core";
import { getGoogleAuth } from "./google.js";
import { toolSchema } from "./schema.js";

function gmailClient(config: Config): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getGoogleAuth(config) });
}

function headerValue(message: gmail_v1.Schema$Message, name: string): string {
  const headers = message.payload?.headers ?? [];
  const match = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? "(unknown)";
}

const gmailSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Gmail search query, e.g. "from:alice is:unread newer_than:7d"'),
  maxResults: z.number().int().min(1).max(25).default(10).describe("Maximum messages to return (1-25)"),
});
type GmailSearchArgs = z.infer<typeof gmailSearchSchema>;

export const gmailSearchTool: ToolDefinition<GmailSearchArgs> = {
  name: "gmail_search",
  description:
    "Search the user's Gmail with a standard Gmail query and return one line per message: " +
    "date — sender — subject, plus the message id. Use for questions about the user's email, " +
    "unread mail, or messages from specific people. Read-only; requires Google authentication " +
    "(run `jarvis google-auth` once).",
  risk: "read",
  schema: toolSchema(gmailSearchSchema),
  execute: async (args, ctx) => {
    const gmail = gmailClient(ctx.config);
    const list = await gmail.users.messages.list({
      userId: "me",
      q: args.query,
      maxResults: args.maxResults,
    });
    const ids = (list.data.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return `No Gmail messages matched "${args.query}".`;
    const details = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ),
    );
    return details
      .map((response) => {
        const message = response.data;
        const date = headerValue(message, "Date");
        const from = headerValue(message, "From");
        const subject = headerValue(message, "Subject");
        return `${date} — ${from} — ${subject} (id: ${message.id ?? "?"})`;
      })
      .join("\n");
  },
};

const gmailCreateDraftSchema = z.object({
  to: z.string().min(1).describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Plain-text email body"),
});
type GmailCreateDraftArgs = z.infer<typeof gmailCreateDraftSchema>;

function buildRawMessage(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

export const gmailCreateDraftTool: ToolDefinition<GmailCreateDraftArgs> = {
  name: "gmail_create_draft",
  description:
    "Create a plain-text draft email in the user's Gmail Drafts folder. The draft is NOT sent — " +
    "the user reviews and sends it themselves. Use whenever asked to write, prepare, or reply to " +
    "an email. Requires Google authentication (run `jarvis google-auth` once).",
  risk: "outbound",
  schema: gmailCreateDraftSchema,
  execute: async (args, ctx) => {
    const gmail = gmailClient(ctx.config);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: buildRawMessage(args.to, args.subject, args.body) } },
    });
    return (
      `Created Gmail draft ${draft.data.id ?? "(unknown id)"} — to ${args.to}, ` +
      `subject "${args.subject}". It is saved in Drafts and has not been sent.`
    );
  },
};

/** Number of unread inbox messages. Used by the Phase-2 daily brief. */
export async function countUnread(config: Config): Promise<number> {
  const gmail = gmailClient(config);
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox",
    labelIds: ["INBOX"],
  });
  return response.data.resultSizeEstimate ?? 0;
}
