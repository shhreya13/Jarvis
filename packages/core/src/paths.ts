import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const PROJECT_NAME = "jarvis";

/** Root of Jarvis state (config, db, identity, skills). Overridable for tests/Docker. */
export function jarvisHome(): string {
  return process.env.JARVIS_HOME ?? path.join(os.homedir(), `.${PROJECT_NAME}`);
}

/** The only directory tools are allowed to write to or execute in. */
export function workspaceDir(): string {
  return process.env.JARVIS_WORKSPACE ?? path.join(os.homedir(), `${PROJECT_NAME}-workspace`);
}

export function ensureDirs(): void {
  fs.mkdirSync(jarvisHome(), { recursive: true });
  fs.mkdirSync(workspaceDir(), { recursive: true });
  fs.mkdirSync(skillsDir(), { recursive: true });
}

export function dbPath(): string {
  return path.join(jarvisHome(), "data.db");
}

export function configPath(): string {
  return path.join(jarvisHome(), "config.json");
}

export function identityPath(): string {
  return path.join(jarvisHome(), "IDENTITY.md");
}

export function tokenPath(): string {
  return path.join(jarvisHome(), "gateway.token");
}

export function googleTokenPath(): string {
  return path.join(jarvisHome(), "google-token.json");
}

export function skillsDir(): string {
  return path.join(jarvisHome(), "skills");
}
