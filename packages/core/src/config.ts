import fs from "node:fs";
import { z } from "zod";
import { configPath, ensureDirs } from "./paths.js";

export const ProviderSchema = z.object({
  type: z.enum(["anthropic", "openai", "openai-compatible"]).default("anthropic"),
  model: z.string().default("claude-sonnet-5"),
  /** Name of the env var holding the API key. Keys are never stored on disk. */
  apiKeyEnv: z.string().default("ANTHROPIC_API_KEY"),
  /** Required for openai-compatible (OpenRouter, Ollama, LM Studio, ...). */
  baseURL: z.string().url().optional(),
});

export const ConfigSchema = z.object({
  assistantName: z.string().default("Jarvis"),
  userName: z.string().default(""),
  provider: ProviderSchema.default({}),
  gateway: z
    .object({
      host: z.string().default("127.0.0.1"),
      port: z.number().int().min(1).max(65535).default(4820),
    })
    .default({}),
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      botTokenEnv: z.string().default("TELEGRAM_BOT_TOKEN"),
      /** Chat that receives briefs and approval prompts, and may talk to the bot. */
      chatId: z.string().default(""),
    })
    .default({}),
  brave: z
    .object({
      apiKeyEnv: z.string().default("BRAVE_API_KEY"),
    })
    .default({}),
  google: z
    .object({
      clientId: z.string().default(""),
      clientSecretEnv: z.string().default("GOOGLE_CLIENT_SECRET"),
    })
    .default({}),
  /** webhook_post may only target URLs starting with one of these prefixes. */
  webhookWhitelist: z.array(z.string()).default([]),
  /** How long non-interactive runs wait for a human before queueing the action. */
  approvalTimeoutMs: z.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

export function loadConfig(): Config {
  const file = configPath();
  if (!fs.existsSync(file)) return defaultConfig();
  const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config at ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function saveConfig(config: Config): void {
  ensureDirs();
  const validated = ConfigSchema.parse(config);
  fs.writeFileSync(configPath(), `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
}

/** Reads the provider API key from the env var named in config. Never persisted. */
export function resolveApiKey(config: Config): string | undefined {
  const value = process.env[config.provider.apiKeyEnv];
  return value && value.length > 0 ? value : undefined;
}
