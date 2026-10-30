import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SandboxViolationError, defaultConfig, openDb } from "@jarvis/core";
import type { Db, ToolContext } from "@jarvis/core";
import { listFilesTool, readFileTool, writeFileTool } from "../src/files.js";

describe("files tools", () => {
  let workspace: string;
  let outside: string;
  let db: Db;
  let ctx: ToolContext;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
    db = openDb(":memory:");
    ctx = { db, config: defaultConfig(), workspaceDir: workspace, source: "cli" };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("writes, reads, and lists a file inside the workspace", async () => {
    const writeResult = await writeFileTool.execute(
      { path: "notes/hello.txt", content: "hello jarvis" },
      ctx,
    );
    expect(writeResult).toContain("12 bytes");
    expect(writeResult).toContain(path.join("notes", "hello.txt"));

    const content = await readFileTool.execute({ path: "notes/hello.txt" }, ctx);
    expect(content).toBe("hello jarvis");

    const listing = await listFilesTool.execute({ path: "." }, ctx);
    const lines = listing.split("\n");
    expect(lines).toContain("notes/");
    expect(lines).toContain("notes/hello.txt");
  });

  it("rejects write_file paths that escape the workspace", async () => {
    await expect(
      writeFileTool.execute({ path: "../escape.txt", content: "nope" }, ctx),
    ).rejects.toThrow(SandboxViolationError);
  });

  it("rejects read_file of an absolute path outside the workspace", async () => {
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(secret, "top secret");
    await expect(readFileTool.execute({ path: secret }, ctx)).rejects.toThrow(
      SandboxViolationError,
    );
  });

  it("rejects reads through a symlinked directory that points outside the workspace", async () => {
    fs.writeFileSync(path.join(outside, "secret.txt"), "top secret");
    fs.symlinkSync(outside, path.join(workspace, "link"));
    await expect(readFileTool.execute({ path: "link/secret.txt" }, ctx)).rejects.toThrow(
      SandboxViolationError,
    );
  });
});
