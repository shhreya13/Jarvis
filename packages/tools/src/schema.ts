import type { z } from "zod";

/**
 * Bridges zod's input/output type split for schemas that use `.default()`.
 *
 * `ToolDefinition.schema` is typed `z.ZodType<Args>`, which fixes the schema's
 * input type to equal its output type. A schema with defaulted fields has a
 * wider raw-input type (the defaulted fields are optional on input), so it is
 * not directly assignable. Runtime parsing behavior is unchanged — this only
 * re-labels the compile-time input type.
 */
export function toolSchema<Output>(
  schema: z.ZodType<Output, z.ZodTypeDef, unknown>,
): z.ZodType<Output> {
  return schema as z.ZodType<Output>;
}
