import { z } from "zod";

interface HnHit {
  title: string;
  url: string | null;
  points: number;
  objectID: string;
}

/**
 * Splits the http_request tool's "HTTP <status> <statusText>\n\n<body>" format.
 */
function bodyOf(httpToolResult: string): string {
  const separator = httpToolResult.indexOf("\n\n");
  return separator === -1 ? httpToolResult : httpToolResult.slice(separator + 2);
}

export const tools = [
  {
    name: "hn_top",
    description:
      "Fetch the current Hacker News front page (title, points, url per story). Use before writing an HN digest.",
    risk: "read" as const,
    schema: z.object({
      count: z.number().int().min(1).max(25).default(10),
    }),
    execute: async (
      args: { count: number },
      ctx: { callTool?: (name: string, args: unknown) => Promise<string> },
    ): Promise<string> => {
      if (!ctx.callTool) throw new Error("hn_top must run inside the Jarvis skill runtime");
      const result = await ctx.callTool("http_request", {
        url: `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${args.count}`,
        method: "GET",
      });
      const parsed = JSON.parse(bodyOf(result)) as { hits: HnHit[] };
      const lines = parsed.hits.map((hit, i) => {
        const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        return `${i + 1}. ${hit.title} (${hit.points} ▲) — ${url}`;
      });
      return lines.join("\n");
    },
  },
];
