import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, openDb } from "@jarvis/core";
import type { Db, ToolContext } from "@jarvis/core";
import { rememberTool, searchMemoryTool } from "../src/memoryTools.js";

describe("memory tools", () => {
  let db: Db;
  let ctx: ToolContext;

  beforeEach(() => {
    db = openDb(":memory:");
    ctx = { db, config: defaultConfig(), workspaceDir: os.tmpdir(), source: "cli" };
  });

  afterEach(() => {
    db.close();
  });

  it("remembers a fact and finds it again via search_memory", async () => {
    const confirmation = await rememberTool.execute(
      { text: "Akhil prefers oat milk lattes" },
      ctx,
    );
    expect(confirmation).toMatch(/id \d+/);
    expect(confirmation).toContain("Akhil prefers oat milk lattes");

    const found = await searchMemoryTool.execute({ query: "oat milk", limit: 10 }, ctx);
    expect(found).toContain("Akhil prefers oat milk lattes");
    expect(found).toMatch(/\[\d+\]/);
  });

  it('says "No memories matched" when nothing matches', async () => {
    await rememberTool.execute({ text: "something entirely different" }, ctx);
    const result = await searchMemoryTool.execute({ query: "zzxqvblorp", limit: 10 }, ctx);
    expect(result).toContain("No memories matched");
  });
});
