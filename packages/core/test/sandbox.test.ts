import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveWorkspacePath, SandboxViolationError } from "../src/sandbox.js";

let root: string;
let outside: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sbx-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-out-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("resolveWorkspacePath", () => {
  it("resolves relative paths inside the workspace", () => {
    const resolved = resolveWorkspacePath(root, "notes/todo.md");
    expect(resolved).toBe(path.join(fs.realpathSync(root), "notes/todo.md"));
  });

  it("allows the workspace root itself", () => {
    expect(resolveWorkspacePath(root, ".")).toBe(fs.realpathSync(root));
  });

  it("rejects parent traversal", () => {
    expect(() => resolveWorkspacePath(root, "../evil.txt")).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath(root, "a/../../evil.txt")).toThrow(SandboxViolationError);
  });

  it("rejects absolute paths outside the workspace", () => {
    expect(() => resolveWorkspacePath(root, "/etc/passwd")).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath(root, path.join(outside, "x.txt"))).toThrow(
      SandboxViolationError,
    );
  });

  it("rejects escape through a symlinked directory inside the workspace", () => {
    fs.symlinkSync(outside, path.join(root, "sneaky"));
    expect(() => resolveWorkspacePath(root, "sneaky/steal.txt")).toThrow(SandboxViolationError);
  });

  it("rejects a symlinked file pointing outside the workspace", () => {
    const target = path.join(outside, "secret.txt");
    fs.writeFileSync(target, "secret");
    fs.symlinkSync(target, path.join(root, "alias.txt"));
    expect(() => resolveWorkspacePath(root, "alias.txt")).toThrow(SandboxViolationError);
  });

  it("accepts nested paths that do not exist yet (for writes)", () => {
    const resolved = resolveWorkspacePath(root, "deep/new/dir/file.txt");
    expect(resolved.startsWith(fs.realpathSync(root))).toBe(true);
  });
});
