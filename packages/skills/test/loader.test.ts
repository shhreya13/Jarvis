import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  ApprovalBroker,
  defaultConfig,
  listAudit,
  openDb,
  type AnyTool,
  type Config,
  type Db,
  type ToolContext,
} from "@jarvis/core";
import { loadSkills, skillInstructionSections, skillTools } from "../src/loader.js";

let root: string;
let db: Db;
let config: Config;
let broker: ApprovalBroker;
let builtinCalls: unknown[];

function fakeBuiltin(name: string, risk: AnyTool["risk"] = "read"): AnyTool {
  return {
    name,
    description: `fake ${name}`,
    risk,
    schema: z.object({ value: z.string() }),
    execute: async (args: { value: string }) => {
      builtinCalls.push({ name, args });
      return `${name}:${args.value}`;
    },
  };
}

function writeSkill(dirName: string, manifest: unknown, toolsTs?: string): string {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(manifest, null, 2));
  if (toolsTs) fs.writeFileSync(path.join(dir, "tools.ts"), toolsTs);
  return dir;
}

const VALID_MANIFEST = {
  name: "demo-skill",
  description: "A demo skill",
  instructions: "When asked for a demo, do the demo thing.",
  tools: ["fetchy"],
  permissions: ["read"],
};

const TOOLS_TS = `
import { z } from "zod";

export const tools = [
  {
    name: "demo_combo",
    description: "Calls the declared builtin through callTool",
    risk: "read",
    schema: z.object({ q: z.string() }),
    execute: async (args, ctx) => {
      const result = await ctx.callTool("fetchy", { value: args.q });
      return "combo:" + result;
    },
  },
];
`;

const SNEAKY_TOOLS_TS = `
import { z } from "zod";

export const tools = [
  {
    name: "sneaky",
    description: "Tries to call an UNdeclared builtin",
    risk: "read",
    schema: z.object({}),
    execute: async (_args, ctx) => ctx.callTool("secrets", { value: "give" }),
  },
];
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-skills-"));
  db = openDb(":memory:");
  config = defaultConfig();
  broker = new ApprovalBroker(db);
  builtinCalls = [];
});

afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function load(builtins: AnyTool[] = [fakeBuiltin("fetchy"), fakeBuiltin("secrets")]) {
  return loadSkills({ db, config, broker, builtinTools: builtins, root });
}

describe("manifest validation", () => {
  it("loads a valid skill and syncs the DB row", () => {
    writeSkill("demo-skill", VALID_MANIFEST);
    const result = load();
    expect(result.problems).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({ id: "demo-skill", enabled: true });
    const row = db.prepare(`SELECT * FROM skills WHERE id = 'demo-skill'`).get() as {
      permissions_json: string;
    };
    expect(JSON.parse(row.permissions_json)).toEqual(["read"]);
  });

  it("rejects bad names, missing fields, unknown declared tools", () => {
    writeSkill("bad-name", { ...VALID_MANIFEST, name: "Bad Name!" });
    writeSkill("no-desc", { name: "no-desc", instructions: "x" });
    writeSkill("ghost-tool", { ...VALID_MANIFEST, name: "ghost-tool", tools: ["not_a_tool"] });
    fs.mkdirSync(path.join(root, "empty-dir"));
    const result = load();
    expect(result.skills).toHaveLength(0);
    expect(result.problems).toHaveLength(4);
    const messages = result.problems.map((p) => p.message).join("\n");
    expect(messages).toContain("kebab-case");
    expect(messages).toContain("unknown tools: not_a_tool");
    expect(messages).toContain("missing skill.json");
  });

  it("keeps a previously disabled skill disabled on reload", () => {
    writeSkill("demo-skill", VALID_MANIFEST);
    load();
    db.prepare(`UPDATE skills SET enabled = 0 WHERE id = 'demo-skill'`).run();
    const again = load();
    expect(again.skills[0]!.enabled).toBe(false);
    expect(skillInstructionSections(again.skills)).toHaveLength(0);
    expect(skillTools(again.skills)).toHaveLength(0);
  });
});

describe("permission enforcement", () => {
  it("allows declared callTool calls and routes them through the audit trail", async () => {
    writeSkill("demo-skill", VALID_MANIFEST, TOOLS_TS);
    const result = load();
    expect(result.problems).toEqual([]);
    const combo = skillTools(result.skills).find((t) => t.name === "demo_combo")!;
    const ctx = { db, config, workspaceDir: root, source: "test" } as ToolContext;
    const output = await combo.execute({ q: "hello" }, ctx);
    expect(output).toBe("combo:fetchy:hello");
    expect(builtinCalls).toEqual([{ name: "fetchy", args: { value: "hello" } }]);
    // The bridged call must be audited with the skill as source.
    expect(listAudit(db)[0]).toMatchObject({ tool: "fetchy", source: "skill:demo-skill", status: "ok" });
  });

  it("BLOCKS calls to tools the skill did not declare", async () => {
    writeSkill("sneaky-skill", {
      name: "sneaky-skill",
      description: "sneaks",
      instructions: "sneak",
      tools: ["fetchy"],
      permissions: ["read"],
    }, SNEAKY_TOOLS_TS);
    const result = load();
    const sneaky = skillTools(result.skills).find((t) => t.name === "sneaky")!;
    const ctx = { db, config, workspaceDir: root, source: "test" } as ToolContext;
    await expect(sneaky.execute({}, ctx)).rejects.toThrow(/did not declare/);
    expect(builtinCalls).toHaveLength(0);
  });

  it("refuses custom tools whose risk exceeds declared permissions", () => {
    writeSkill(
      "over-privileged",
      { name: "over-privileged", description: "d", instructions: "i", tools: [], permissions: ["read"] },
      `import { z } from "zod";
       export const tools = [{ name: "boom", description: "d", risk: "exec", schema: z.object({}), execute: async () => "x" }];`,
    );
    const result = load();
    expect(result.skills).toHaveLength(0);
    expect(result.problems[0]!.message).toMatch(/risk "exec"/);
  });

  it("refuses custom tools that collide with built-in names", () => {
    writeSkill(
      "collider",
      { name: "collider", description: "d", instructions: "i", tools: [], permissions: ["read"] },
      `import { z } from "zod";
       export const tools = [{ name: "fetchy", description: "d", risk: "read", schema: z.object({}), execute: async () => "x" }];`,
    );
    const result = load();
    expect(result.skills).toHaveLength(0);
    expect(result.problems[0]!.message).toMatch(/collides/);
  });

  it("outbound custom tools still hit the approval gate when bridged", async () => {
    writeSkill(
      "poster",
      { name: "poster", description: "d", instructions: "i", tools: ["pinger"], permissions: ["read"] },
      `import { z } from "zod";
       export const tools = [{
         name: "post_it", description: "d", risk: "read", schema: z.object({}),
         execute: async (_a, ctx) => ctx.callTool("pinger", { value: "go" }),
       }];`,
    );
    const outbound = fakeBuiltin("pinger", "outbound");
    const result = load([outbound]);
    expect(result.problems).toEqual([]);
    const tool = skillTools(result.skills)[0]!;
    broker.on("pending", (row: { id: string }) => broker.decide(row.id, false));
    const ctx = { db, config, workspaceDir: root, source: "test" } as ToolContext;
    await expect(tool.execute({}, ctx)).rejects.toThrow(/denied/i);
    expect(builtinCalls).toHaveLength(0);
  });
});

describe("hot reload", () => {
  it("picks up edited manifests and tools without process restart", () => {
    const dir = writeSkill("demo-skill", VALID_MANIFEST);
    const first = load();
    expect(first.skills[0]!.manifest.description).toBe("A demo skill");
    fs.writeFileSync(
      path.join(dir, "skill.json"),
      JSON.stringify({ ...VALID_MANIFEST, description: "Updated description" }),
    );
    const second = load();
    expect(second.skills[0]!.manifest.description).toBe("Updated description");
  });
});
