import type { z } from "zod";
import type { Db } from "./db.js";
import type { Config } from "./config.js";

export type Risk = "read" | "write" | "outbound" | "exec";

export const AUTO_RUN_RISKS: readonly Risk[] = ["read", "write"];

export function requiresApproval(risk: Risk): boolean {
  return risk === "outbound" || risk === "exec";
}

export interface ToolContext {
  db: Db;
  config: Config;
  workspaceDir: string;
  /** Which channel initiated this call: cli | telegram | ws | job:<id> | skill:<id> */
  source: string;
  sessionId?: string;
  /**
   * Facade for skill-provided tools to invoke built-in tools. The skill loader
   * injects a permission-checked implementation; built-in tools never need it.
   */
  callTool?: (name: string, args: unknown) => Promise<string>;
}

export interface ToolDefinition<Args = unknown> {
  name: string;
  description: string;
  /** Static risk class. read/write auto-run; outbound/exec always gate on approval. */
  risk: Risk;
  /** Optional per-call override (http_request: GET=read, others=outbound). */
  riskFor?: (args: Args) => Risk;
  schema: z.ZodType<Args>;
  /**
   * Optional pre-approval validation (e.g. webhook whitelist). Returning a string
   * rejects the call with that reason before any approval is requested.
   */
  validate?: (args: Args, ctx: ToolContext) => string | undefined;
  execute: (args: Args, ctx: ToolContext) => Promise<string>;
}

/** Erased-args tool type used wherever tools of mixed arg shapes are collected. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any>;

export function effectiveRisk<Args>(tool: ToolDefinition<Args>, args: Args): Risk {
  return tool.riskFor ? tool.riskFor(args) : tool.risk;
}
