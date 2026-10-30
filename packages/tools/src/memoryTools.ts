import { z } from "zod";
import {
  remember as storeMemory,
  searchMemory as searchMemories,
  type ToolDefinition,
} from "@jarvis/core";
import { toolSchema } from "./schema.js";

const rememberSchema = z.object({
  text: z.string().min(1).describe("One self-contained fact, preference, or note to store"),
});
type RememberArgs = z.infer<typeof rememberSchema>;

export const rememberTool: ToolDefinition<RememberArgs> = {
  name: "remember",
  description:
    "Store a short fact, preference, or note in Jarvis's long-term memory so it can be recalled " +
    "in future conversations. Use when the user shares something durable about themselves, their " +
    "projects, or their preferences. Store one self-contained fact per call.",
  risk: "write",
  schema: rememberSchema,
  execute: async (args, ctx) => {
    const memory = storeMemory(ctx.db, args.text);
    return `Remembered (id ${memory.id}): ${memory.text}`;
  },
};

const searchMemorySchema = z.object({
  query: z.string().min(1).describe("Full-text search terms"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum matches to return"),
});
type SearchMemoryArgs = z.infer<typeof searchMemorySchema>;

export const searchMemoryTool: ToolDefinition<SearchMemoryArgs> = {
  name: "search_memory",
  description:
    "Search Jarvis's long-term memory with full-text search and return matching entries with " +
    "their ids and dates. Use before answering questions about the user's preferences, past " +
    "decisions, or previously stored facts.",
  risk: "read",
  schema: toolSchema(searchMemorySchema),
  execute: async (args, ctx) => {
    const matches = searchMemories(ctx.db, args.query, args.limit);
    if (matches.length === 0) return `No memories matched "${args.query}".`;
    return matches
      .map((memory) => `[${memory.id}] ${new Date(memory.created_at).toISOString()} — ${memory.text}`)
      .join("\n");
  },
};
