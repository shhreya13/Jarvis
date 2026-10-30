import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { Config } from "./config.js";
import { resolveApiKey } from "./config.js";

/**
 * Builds the Vercel AI SDK model for the configured provider. API keys are read
 * exclusively from the env var named in config — never from disk or the DB.
 */
export function buildModel(config: Config): LanguageModel {
  const { type, model, baseURL, apiKeyEnv } = config.provider;
  const apiKey = resolveApiKey(config);

  switch (type) {
    case "anthropic": {
      if (!apiKey) throw missingKeyError(apiKeyEnv, "Anthropic");
      return createAnthropic({ apiKey })(model);
    }
    case "openai": {
      if (!apiKey) throw missingKeyError(apiKeyEnv, "OpenAI");
      return createOpenAI({ apiKey })(model);
    }
    case "openai-compatible": {
      if (!baseURL) {
        throw new Error(
          `provider.baseURL is required for "openai-compatible" (OpenRouter, Ollama, LM Studio, ...)`,
        );
      }
      // Many local servers (Ollama, LM Studio) need no key; pass a placeholder.
      return createOpenAICompatible({
        name: "openai-compatible",
        baseURL,
        apiKey: apiKey ?? "not-needed",
      })(model);
    }
  }
}

function missingKeyError(envVar: string, providerName: string): Error {
  return new Error(
    `${providerName} API key not found: set the ${envVar} environment variable (Jarvis never stores keys on disk).`,
  );
}
