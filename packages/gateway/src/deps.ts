import { EventEmitter } from "node:events";
import {
  ApprovalBroker,
  aiSdkStream,
  buildModel,
  ensureDirs,
  loadConfig,
  openDb,
  type AnyTool,
  type Config,
  type Db,
  type ModelStreamFn,
} from "@jarvis/core";
import { buildBuiltinTools } from "@jarvis/tools";

/** Sends plain text to an outbound channel (today: "telegram"). */
export type ChannelSender = (text: string) => Promise<void>;

export interface GatewayDeps {
  db: Db;
  config: Config;
  broker: ApprovalBroker;
  tools: AnyTool[];
  streamFn: ModelStreamFn;
  /** Instructions of enabled skills, re-read per turn (wired in Phase 4). */
  skillInstructions: () => string[];
  channels: Map<string, ChannelSender>;
  /** In-process bus; server broadcasts "broadcast" payloads to all ws clients. */
  events: EventEmitter;
  /** Set by attachSkills (Phase 4); exposes hot reload to the /skills/reload route. */
  skillsRuntime?: { reload: () => unknown };
}

export function createDeps(overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  ensureDirs();
  const db = overrides.db ?? openDb();
  const config = overrides.config ?? loadConfig();
  return {
    db,
    config,
    broker: overrides.broker ?? new ApprovalBroker(db),
    tools: overrides.tools ?? buildBuiltinTools(),
    streamFn: overrides.streamFn ?? aiSdkStream(buildModel(config)),
    skillInstructions: overrides.skillInstructions ?? (() => []),
    channels: overrides.channels ?? new Map(),
    events: overrides.events ?? new EventEmitter(),
  };
}
