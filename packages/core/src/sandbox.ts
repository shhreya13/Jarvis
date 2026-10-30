import fs from "node:fs";
import path from "node:path";

export class SandboxViolationError extends Error {
  constructor(requested: string, root: string) {
    super(`Path escapes the workspace sandbox: "${requested}" resolves outside ${root}`);
    this.name = "SandboxViolationError";
  }
}

/** Realpath of the nearest existing ancestor (defeats symlinked-directory escapes). */
function realpathOfNearestAncestor(target: string): string {
  let current = target;
  for (;;) {
    if (fs.existsSync(current)) return fs.realpathSync(current);
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/**
 * Resolves a user/model-supplied path against the workspace root and throws
 * SandboxViolationError unless the real location stays inside the workspace.
 * Checks both the lexical resolution and the realpath (symlink escapes).
 */
export function resolveWorkspacePath(root: string, requested: string): string {
  const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  const resolved = path.resolve(rootReal, requested);

  const isInside = (candidate: string): boolean =>
    candidate === rootReal || candidate.startsWith(rootReal + path.sep);

  if (!isInside(resolved)) throw new SandboxViolationError(requested, root);
  if (!isInside(realpathOfNearestAncestor(resolved))) {
    throw new SandboxViolationError(requested, root);
  }
  return resolved;
}
