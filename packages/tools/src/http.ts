import { z } from "zod";
import type { Risk, ToolDefinition } from "@jarvis/core";
import { toolSchema } from "./schema.js";

const HTTP_TIMEOUT_MS = 30_000;
const MAX_BODY_CHARS = 20_000;

const httpRequestSchema = z.object({
  url: z
    .string()
    .refine(
      (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "url must be a valid http:// or https:// URL" },
    )
    .describe("Absolute http(s) URL to request"),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    .default("GET")
    .describe("HTTP method (defaults to GET)"),
  headers: z.record(z.string()).optional().describe("Optional request headers"),
  body: z.string().optional().describe("Optional request body (ignored for GET/HEAD)"),
});
type HttpRequestArgs = z.infer<typeof httpRequestSchema>;

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Returns a rejection reason when the URL targets a private/loopback/link-local host. */
function privateHostReason(url: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return `Invalid URL: ${url}`;
  }
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const isBlocked =
    bare === "localhost" ||
    bare.endsWith(".localhost") ||
    bare.endsWith(".local") ||
    bare === "::1" ||
    bare === "::" ||
    isPrivateIpv4(bare);
  if (isBlocked) {
    return (
      `Refusing to request ${hostname}: private, loopback, and link-local addresses ` +
      "are blocked for http_request."
    );
  }
  return undefined;
}

export const httpRequestTool: ToolDefinition<HttpRequestArgs> = {
  name: "http_request",
  description:
    "Make an HTTP request to a public URL and return the status line plus the response body " +
    "(capped at 20,000 characters). Use for calling JSON APIs or fetching web pages. " +
    "GET and HEAD are read-only; other methods send data and require approval. " +
    "Requests to private, loopback, or link-local addresses are refused. 30-second timeout.",
  risk: "read",
  riskFor: (args): Risk => (args.method === "GET" || args.method === "HEAD" ? "read" : "outbound"),
  schema: toolSchema(httpRequestSchema),
  validate: (args) => privateHostReason(args.url),
  execute: async (args) => {
    const hasBody = args.method !== "GET" && args.method !== "HEAD";
    const response = await fetch(args.url, {
      method: args.method,
      headers: args.headers,
      body: hasBody ? args.body : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await response.text();
    const body =
      text.length > MAX_BODY_CHARS
        ? `${text.slice(0, MAX_BODY_CHARS)}\n\n[Body truncated: showing the first ${MAX_BODY_CHARS} of ${text.length} characters]`
        : text;
    return `HTTP ${response.status} ${response.statusText}\n\n${body}`;
  },
};
