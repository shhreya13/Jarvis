import { z } from "zod";

/**
 * skill.json contract. `tools` = built-in tools the skill's CODE may invoke
 * through ctx.callTool (anything else throws). `permissions` = risk classes
 * the skill's exported custom tools may declare (loader refuses others).
 */
export const SkillManifestSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "skill name must be kebab-case ([a-z0-9-])")
    .max(64),
  description: z.string().min(1).max(500),
  /** Injected into the system prompt while the skill is enabled. */
  instructions: z.string().min(1).max(8_000),
  tools: z.array(z.string()).default([]),
  permissions: z.array(z.enum(["read", "write", "outbound", "exec"])).default([]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export interface ManifestProblem {
  dir: string;
  message: string;
}

export function parseManifest(raw: unknown): SkillManifest {
  return SkillManifestSchema.parse(raw);
}
