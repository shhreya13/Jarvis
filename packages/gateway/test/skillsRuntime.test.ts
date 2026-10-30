import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  ApprovalBroker,
  defaultConfig,
  openDb,
  type AnyTool,
  type Db,
} from "@jarvis/core";
import { attachSkills } from "../src/skillsRuntime.js";
import { setSkillEnabled } from "../src/skillsStore.js";
import type { GatewayDeps } from "../src/deps.js";

let db: Db;
let root: string;
let deps: GatewayDeps;

function builtin(name: string): AnyTool {
  return {
    name,
    description: "builtin",
    risk: "read",
    schema: z.object({}),
    execute: async () => "ok",
  };
}

beforeEach(() => {
  db = openDb(":memory:");
  root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-skillsrt-"));
  deps = {
    db,
    config: defaultConfig(),
    broker: new ApprovalBroker(db),
    tools: [builtin("web_search"), builtin("http_request")],
    streamFn: async function* () {
      yield { type: "finish", finishReason: "stop" };
    },
    skillInstructions: () => [],
    channels: new Map(),
    events: new EventEmitter(),
  };
});

afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSkill(): void {
  const dir = path.join(root, "greeter");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "skill.json"),
    JSON.stringify({
      name: "greeter",
      description: "Greets",
      instructions: "Greet enthusiastically.",
      tools: ["http_request"],
      permissions: ["read"],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "tools.ts"),
    `import { z } from "zod";
     export const tools = [{
       name: "greet", description: "greet", risk: "read",
       schema: z.object({ who: z.string() }),
       execute: async (args) => "hello " + args.who,
     }];`,
  );
}

describe("attachSkills", () => {
  it("adds skill tools and instructions on reload, keeps built-ins pinned", () => {
    writeSkill();
    const runtime = attachSkills(deps, { root });
    const report = runtime.reload();
    expect(report.problems).toEqual([]);
    expect(report.loaded).toEqual([{ id: "greeter", enabled: true, tools: ["greet"] }]);
    expect(deps.tools.map((t) => t.name)).toEqual(["web_search", "http_request", "greet"]);
    expect(deps.skillInstructions().join("\n")).toContain("Greet enthusiastically");
    expect(deps.skillsRuntime).toBe(runtime);
  });

  it("disable + reload removes the skill's tools and instructions", () => {
    writeSkill();
    const runtime = attachSkills(deps, { root });
    runtime.reload();
    setSkillEnabled(db, "greeter", false);
    runtime.reload();
    expect(deps.tools.map((t) => t.name)).toEqual(["web_search", "http_request"]);
    expect(deps.skillInstructions()).toEqual([]);
  });

  it("reload is idempotent — repeated reloads never duplicate tools", () => {
    writeSkill();
    const runtime = attachSkills(deps, { root });
    runtime.reload();
    runtime.reload();
    runtime.reload();
    expect(deps.tools.filter((t) => t.name === "greet")).toHaveLength(1);
  });

  it("reports problems without dropping valid skills", () => {
    writeSkill();
    const badDir = path.join(root, "broken");
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, "skill.json"), "{not json");
    const runtime = attachSkills(deps, { root });
    const report = runtime.reload();
    expect(report.loaded).toHaveLength(1);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("invalid skill.json");
  });
});
