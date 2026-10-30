import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, openDb } from "@jarvis/core";
import type { Db, ToolContext } from "@jarvis/core";
import { webhookPostTool } from "../src/webhook.js";

describe("webhook_post validate", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  function makeCtx(webhookWhitelist: string[]): ToolContext {
    return {
      db,
      config: { ...defaultConfig(), webhookWhitelist },
      workspaceDir: os.tmpdir(),
      source: "cli",
    };
  }

  it("rejects every URL when the whitelist is empty", () => {
    const reason = webhookPostTool.validate?.(
      { url: "https://hooks.example.com/T123", payload: { text: "hi" } },
      makeCtx([]),
    );
    expect(reason).toBeTypeOf("string");
    expect(reason).toContain("webhookWhitelist");
  });

  it("rejects a URL that does not match any whitelisted prefix", () => {
    const reason = webhookPostTool.validate?.(
      { url: "https://evil.example.org/hook", payload: { text: "hi" } },
      makeCtx(["https://hooks.example.com/"]),
    );
    expect(reason).toBeTypeOf("string");
    expect(reason).toContain("not allowed");
  });

  it("accepts a URL that matches a whitelisted prefix", () => {
    const reason = webhookPostTool.validate?.(
      { url: "https://hooks.example.com/T123/B456", payload: { text: "hi" } },
      makeCtx(["https://hooks.example.com/"]),
    );
    expect(reason).toBeUndefined();
  });
});
