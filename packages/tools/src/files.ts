import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveWorkspacePath, type ToolDefinition } from "@jarvis/core";
import { toolSchema } from "./schema.js";

const MAX_READ_CHARS = 50_000;
const MAX_LIST_DEPTH = 3;
const MAX_LIST_ENTRIES = 500;

const readFileSchema = z.object({
  path: z.string().min(1).describe("File path, relative to the workspace root"),
});
type ReadFileArgs = z.infer<typeof readFileSchema>;

export const readFileTool: ToolDefinition<ReadFileArgs> = {
  name: "read_file",
  description:
    "Read a UTF-8 text file from the agent workspace and return its contents. " +
    "Use when you need the current contents of a specific file (use list_files first to discover paths). " +
    "Paths are relative to the workspace root; access outside the workspace is blocked. " +
    "Output is capped at 50,000 characters.",
  risk: "read",
  schema: readFileSchema,
  execute: async (args, ctx) => {
    const target = resolveWorkspacePath(ctx.workspaceDir, args.path);
    const content = await fs.readFile(target, "utf8");
    if (content.length <= MAX_READ_CHARS) return content;
    return (
      `${content.slice(0, MAX_READ_CHARS)}\n\n` +
      `[Truncated: showing the first ${MAX_READ_CHARS} of ${content.length} characters]`
    );
  },
};

const writeFileSchema = z.object({
  path: z.string().min(1).describe("Destination file path, relative to the workspace root"),
  content: z.string().describe("Full UTF-8 text content to write (overwrites any existing file)"),
});
type WriteFileArgs = z.infer<typeof writeFileSchema>;

export const writeFileTool: ToolDefinition<WriteFileArgs> = {
  name: "write_file",
  description:
    "Create or overwrite a UTF-8 text file inside the agent workspace, creating parent directories as needed. " +
    "Use to save notes, drafts, scripts, or other artifacts the user asked for. " +
    "Paths are relative to the workspace root; writing outside the workspace is blocked.",
  risk: "write",
  schema: writeFileSchema,
  execute: async (args, ctx) => {
    const target = resolveWorkspacePath(ctx.workspaceDir, args.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.content, "utf8");
    const workspaceRoot = resolveWorkspacePath(ctx.workspaceDir, ".");
    const relativePath = path.relative(workspaceRoot, target);
    const bytes = Buffer.byteLength(args.content, "utf8");
    return `Wrote ${bytes} bytes to ${relativePath}`;
  },
};

const listFilesSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe("Directory to list, relative to the workspace root (defaults to the root itself)"),
});
type ListFilesArgs = z.infer<typeof listFilesSchema>;

async function collectEntries(
  dir: string,
  prefix: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (out.length >= MAX_LIST_ENTRIES) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (out.length >= MAX_LIST_ENTRIES) return;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(`${relPath}/`);
      if (depth < MAX_LIST_DEPTH) {
        await collectEntries(path.join(dir, entry.name), relPath, depth + 1, out);
      }
    } else {
      out.push(relPath);
    }
  }
}

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: "list_files",
  description:
    "Recursively list files and directories inside the agent workspace (max depth 3, max 500 entries; " +
    "node_modules and dotfiles are skipped). Directories end with a trailing '/'. " +
    "Use to discover what exists before reading or writing files. Paths outside the workspace are blocked.",
  risk: "read",
  schema: toolSchema(listFilesSchema),
  execute: async (args, ctx) => {
    const root = resolveWorkspacePath(ctx.workspaceDir, args.path);
    const lines: string[] = [];
    await collectEntries(root, "", 1, lines);
    if (lines.length === 0) return "(directory is empty)";
    const listing = lines.join("\n");
    if (lines.length >= MAX_LIST_ENTRIES) {
      return `${listing}\n\n[Listing truncated at ${MAX_LIST_ENTRIES} entries]`;
    }
    return listing;
  },
};
