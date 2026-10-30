import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "@jarvis/core";

const execFileAsync = promisify(execFile);

const SHELL_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

const shellExecSchema = z.object({
  command: z.string().min(1).describe("POSIX shell command line, run with /bin/sh -c"),
});
type ShellExecArgs = z.infer<typeof shellExecSchema>;

interface ExecFailure {
  code?: number | string | null;
  signal?: string | null;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
}

function formatStreams(stdout: string, stderr: string): string {
  const out = stdout === "" ? "(empty)" : stdout;
  const err = stderr === "" ? "(empty)" : stderr;
  return `stdout:\n${out}\n\nstderr:\n${err}`;
}

function describeFailure(failure: Error & ExecFailure): string {
  const code = failure.code;
  if (typeof code === "number" || typeof code === "string") {
    return `Command exited with code ${code}`;
  }
  if (failure.killed === true) {
    return (
      `Command was killed (${failure.signal ?? "signal unknown"}) — ` +
      `it likely exceeded the ${SHELL_TIMEOUT_MS / 1000}s timeout or the 1MB output cap`
    );
  }
  return `Command failed: ${failure.message}`;
}

export const shellExecTool: ToolDefinition<ShellExecArgs> = {
  name: "shell_exec",
  description:
    "Run a shell command with /bin/sh inside the agent workspace directory and return its stdout and stderr. " +
    "Use for file manipulation, git, package tools, or quick scripts when no more specific tool fits. " +
    "A non-zero exit code is reported in the output rather than raised as an error. " +
    "Commands time out after 60 seconds and output is capped at 1MB. Always requires user approval.",
  risk: "exec",
  schema: shellExecSchema,
  execute: async (args, ctx) => {
    try {
      const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", args.command], {
        cwd: ctx.workspaceDir,
        timeout: SHELL_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      return formatStreams(stdout, stderr);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      const failure = error as Error & ExecFailure;
      return `${describeFailure(failure)}\n\n${formatStreams(failure.stdout ?? "", failure.stderr ?? "")}`;
    }
  },
};
