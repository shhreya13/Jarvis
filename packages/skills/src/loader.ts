import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createJiti } from "jiti";
import {
  executeToolCall,
  skillsDir,
  type AnyTool,
  type ApprovalBroker,
  type Config,
  type Db,
  type ToolContext,
} from "@jarvis/core";
import { parseManifest, type ManifestProblem, type SkillManifest } from "./manifest.js";

export class SkillPermissionError extends Error {
  constructor(skill: string, tool: string, declared: string[]) {
    super(
      `Skill "${skill}" tried to call tool "${tool}" which it did not declare. ` +
        `Declared tools: [${declared.join(", ")}]. Add it to "tools" in skill.json to allow this.`,
    );
    this.name = "SkillPermissionError";
  }
}

export interface LoadedSkill {
  id: string;
  dir: string;
  manifest: SkillManifest;
  enabled: boolean;
  /** Custom tools from tools.ts, permission-wrapped. */
  tools: AnyTool[];
}

export interface SkillLoadResult {
  skills: LoadedSkill[];
  problems: ManifestProblem[];
}

export interface LoadSkillsOptions {
  db: Db;
  config: Config;
  broker: ApprovalBroker;
  /** Built-in tools that ctx.callTool may dispatch to (with audit + approval). */
  builtinTools: AnyTool[];
  root?: string;
}

interface SkillDbRow {
  id: string;
  enabled: number;
}

function looksLikeTool(candidate: unknown): candidate is AnyTool {
  if (typeof candidate !== "object" || candidate === null) return false;
  const t = candidate as Record<string, unknown>;
  return (
    typeof t.name === "string" &&
    typeof t.description === "string" &&
    typeof t.risk === "string" &&
    typeof t.execute === "function" &&
    typeof t.schema === "object" &&
    t.schema !== null &&
    "safeParse" in (t.schema as object)
  );
}

/**
 * The only bridge from skill code back into Jarvis. Every call goes through
 * executeToolCall, so the audit trail and the approval gate apply exactly as
 * they do for the model — a skill cannot bypass them, and it cannot reach any
 * tool it did not declare in its manifest.
 */
function makeRestrictedCallTool(
  skill: SkillManifest,
  opts: LoadSkillsOptions,
): (name: string, args: unknown) => Promise<string> {
  return async (name, args) => {
    if (!skill.tools.includes(name)) {
      throw new SkillPermissionError(skill.name, name, skill.tools);
    }
    const outcome = await executeToolCall({
      db: opts.db,
      config: opts.config,
      tools: opts.builtinTools,
      broker: opts.broker,
      source: `skill:${skill.name}`,
      toolName: name,
      args,
    });
    if (outcome.status !== "ok") {
      throw new Error(`${name} → ${outcome.status}: ${outcome.result}`);
    }
    return outcome.result;
  };
}

function wrapSkillTool(tool: AnyTool, skill: SkillManifest, opts: LoadSkillsOptions): AnyTool {
  return {
    ...tool,
    execute: (args: unknown, ctx: ToolContext) =>
      tool.execute(args as never, { ...ctx, callTool: makeRestrictedCallTool(skill, opts) }),
  };
}

function syncDbRow(db: Db, manifest: SkillManifest, dir: string): boolean {
  const existing = db.prepare(`SELECT id, enabled FROM skills WHERE id = ?`).get(manifest.name) as
    | SkillDbRow
    | undefined;
  const permissions = JSON.stringify(manifest.permissions);
  if (existing) {
    db.prepare(`UPDATE skills SET path = ?, permissions_json = ? WHERE id = ?`).run(
      dir,
      permissions,
      manifest.name,
    );
    return existing.enabled === 1;
  }
  db.prepare(`INSERT INTO skills (id, path, enabled, permissions_json) VALUES (?, ?, 1, ?)`).run(
    manifest.name,
    dir,
    permissions,
  );
  return true;
}

/**
 * Scans <root>/<skill>/skill.json folders, validates manifests, enforces
 * permissions, loads optional tools.ts (jiti — TS supported), and syncs the
 * skills table. Invalid skills are reported, never partially loaded.
 */
export function loadSkills(opts: LoadSkillsOptions): SkillLoadResult {
  const root = opts.root ?? skillsDir();
  const skills: LoadedSkill[] = [];
  const problems: ManifestProblem[] = [];
  if (!fs.existsSync(root)) return { skills, problems };

  const builtinNames = new Set(opts.builtinTools.map((t) => t.name));
  // Skill folders live outside any node_modules; alias zod to the runtime's
  // copy so `import { z } from "zod"` works in tools.ts with zero installs.
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: { zod: createRequire(import.meta.url).resolve("zod") },
  });

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifestPath = path.join(dir, "skill.json");
    if (!fs.existsSync(manifestPath)) {
      problems.push({ dir, message: "missing skill.json" });
      continue;
    }

    let manifest: SkillManifest;
    try {
      manifest = parseManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    } catch (err) {
      problems.push({ dir, message: `invalid skill.json: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    const undeclaredBuiltins = manifest.tools.filter((t) => !builtinNames.has(t));
    if (undeclaredBuiltins.length > 0) {
      problems.push({
        dir,
        message: `skill.json declares unknown tools: ${undeclaredBuiltins.join(", ")}`,
      });
      continue;
    }

    const customTools: AnyTool[] = [];
    const toolsFile = ["tools.ts", "tools.js", "tools.mts", "tools.mjs"]
      .map((f) => path.join(dir, f))
      .find((f) => fs.existsSync(f));
    if (toolsFile) {
      try {
        const mod = jiti(toolsFile) as { tools?: unknown; default?: unknown };
        const exported = (mod.tools ?? mod.default ?? []) as unknown;
        if (!Array.isArray(exported)) throw new Error("tools.ts must export `tools: ToolDefinition[]`");
        for (const candidate of exported) {
          if (!looksLikeTool(candidate)) {
            throw new Error("exported tool is missing name/description/risk/schema/execute");
          }
          if (builtinNames.has(candidate.name)) {
            throw new Error(`tool "${candidate.name}" collides with a built-in tool name`);
          }
          if (!manifest.permissions.includes(candidate.risk)) {
            throw new Error(
              `tool "${candidate.name}" has risk "${candidate.risk}" but skill.json permissions only allow [${manifest.permissions.join(", ")}]`,
            );
          }
          customTools.push(wrapSkillTool(candidate, manifest, opts));
        }
      } catch (err) {
        problems.push({
          dir,
          message: `tools file rejected: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
    }

    const enabled = syncDbRow(opts.db, manifest, dir);
    skills.push({ id: manifest.name, dir, manifest, enabled, tools: customTools });
  }

  return { skills, problems };
}

/** System-prompt sections for the enabled skills. */
export function skillInstructionSections(skills: LoadedSkill[]): string[] {
  return skills
    .filter((s) => s.enabled)
    .map((s) => `## Skill: ${s.manifest.name}\n${s.manifest.description}\n\n${s.manifest.instructions}`);
}

/** All custom tools contributed by enabled skills. */
export function skillTools(skills: LoadedSkill[]): AnyTool[] {
  return skills.filter((s) => s.enabled).flatMap((s) => s.tools);
}
