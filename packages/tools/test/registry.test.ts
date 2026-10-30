import { describe, expect, it } from "vitest";
import type { Risk } from "@jarvis/core";
import { buildBuiltinTools } from "../src/index.js";

const EXPECTED_RISKS: Record<string, Risk> = {
  read_file: "read",
  write_file: "write",
  list_files: "read",
  shell_exec: "exec",
  http_request: "read",
  web_search: "read",
  remember: "write",
  search_memory: "read",
  gmail_search: "read",
  gmail_create_draft: "outbound",
  calendar_read: "read",
  webhook_post: "outbound",
};

describe("buildBuiltinTools", () => {
  it("returns exactly the 12 expected tools", () => {
    const names = buildBuiltinTools().map((tool) => tool.name);
    expect(names).toHaveLength(12);
    expect([...names].sort()).toEqual(Object.keys(EXPECTED_RISKS).sort());
  });

  it("assigns the expected static risk to every tool", () => {
    for (const tool of buildBuiltinTools()) {
      expect(tool.risk, `risk of ${tool.name}`).toBe(EXPECTED_RISKS[tool.name]);
    }
  });

  it("gives http_request a static read risk plus a riskFor override", () => {
    const httpTool = buildBuiltinTools().find((tool) => tool.name === "http_request");
    expect(httpTool).toBeDefined();
    expect(httpTool?.risk).toBe("read");
    expect(httpTool?.riskFor).toBeTypeOf("function");
  });

  it("gives every tool a routable description and a zod schema", () => {
    for (const tool of buildBuiltinTools()) {
      expect(typeof tool.description, `description of ${tool.name}`).toBe("string");
      expect(tool.description.trim().length, `description of ${tool.name}`).toBeGreaterThan(20);
      expect(typeof tool.schema.safeParse, `schema of ${tool.name}`).toBe("function");
    }
  });
});
