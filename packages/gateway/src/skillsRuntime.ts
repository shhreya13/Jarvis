import { loadSkills, skillInstructionSections, skillTools, type ManifestProblem } from "@jarvis/skills";
import type { GatewayDeps } from "./deps.js";

export interface SkillReloadReport {
  loaded: { id: string; enabled: boolean; tools: string[] }[];
  problems: ManifestProblem[];
}

export interface SkillsRuntime {
  reload: () => SkillReloadReport;
}

/**
 * Wires the skill system into a live gateway. The deps.tools array reference
 * is shared by every channel (server, telegram, scheduler), so reload swaps
 * the skill-contributed tail of that array in place — built-ins stay pinned at
 * the front — and refreshes the system-prompt sections. Hot reload without a
 * daemon restart.
 */
export function attachSkills(deps: GatewayDeps, options: { root?: string } = {}): SkillsRuntime {
  const builtins = deps.tools.slice();
  let sections: string[] = [];

  deps.skillInstructions = () => sections;

  const reload = (): SkillReloadReport => {
    const result = loadSkills({
      db: deps.db,
      config: deps.config,
      broker: deps.broker,
      builtinTools: builtins,
      root: options.root,
    });
    sections = skillInstructionSections(result.skills);
    deps.tools.splice(0, deps.tools.length, ...builtins, ...skillTools(result.skills));
    return {
      loaded: result.skills.map((s) => ({
        id: s.id,
        enabled: s.enabled,
        tools: s.tools.map((t) => t.name),
      })),
      problems: result.problems,
    };
  };

  const runtime = { reload };
  deps.skillsRuntime = runtime;
  return runtime;
}
