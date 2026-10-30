import { z } from "zod";
import type { ToolDefinition } from "@jarvis/core";
import { toolSchema } from "./schema.js";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const SEARCH_TIMEOUT_MS = 15_000;
const MAX_ERROR_DETAIL_CHARS = 500;

const webSearchSchema = z.object({
  query: z.string().min(1).describe("Web search query"),
  count: z.number().int().min(1).max(10).default(5).describe("Number of results to return (1-10)"),
});
type WebSearchArgs = z.infer<typeof webSearchSchema>;

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

export const webSearchTool: ToolDefinition<WebSearchArgs> = {
  name: "web_search",
  description:
    "Search the web via the Brave Search API and return the top results as numbered blocks of " +
    "title, URL, and description. Use for current events, facts you are unsure about, or to find " +
    "pages worth fetching with http_request. Returns 1-10 results.",
  risk: "read",
  schema: toolSchema(webSearchSchema),
  execute: async (args, ctx) => {
    const envVar = ctx.config.brave.apiKeyEnv;
    const apiKey = process.env[envVar];
    if (!apiKey) {
      throw new Error(
        `Brave Search API key is not configured. Set the ${envVar} environment variable to your ` +
          "Brave Search API key (get one at https://brave.com/search/api/).",
      );
    }
    const url = new URL(BRAVE_SEARCH_ENDPOINT);
    url.searchParams.set("q", args.query);
    url.searchParams.set("count", String(args.count));
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      const detail = (await response.text()).slice(0, MAX_ERROR_DETAIL_CHARS);
      throw new Error(
        `Brave Search request failed: HTTP ${response.status} ${response.statusText}` +
          (detail ? ` — ${detail}` : ""),
      );
    }
    const data = (await response.json()) as BraveSearchResponse;
    const results = data.web?.results ?? [];
    if (results.length === 0) return `No web results found for "${args.query}".`;
    return results
      .map((result, index) => {
        const title = stripHtml(result.title ?? "(untitled)");
        const description = stripHtml(result.description ?? "");
        return `${index + 1}. ${title}\n${result.url ?? "(no url)"}\n${description}`;
      })
      .join("\n\n");
  },
};
