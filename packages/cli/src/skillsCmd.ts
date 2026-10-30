import {
  ApprovalBroker,
  loadConfig,
  openDb,
  readToken,
  skillsDir,
} from "@jarvis/core";
import { buildBuiltinTools } from "@jarvis/tools";
import { loadSkills } from "@jarvis/skills";

interface ReloadReport {
  loaded: { id: string; enabled: boolean; tools: string[] }[];
  problems: { dir: string; message: string }[];
}

function printReport(report: ReloadReport, heading: string): void {
  console.log(heading);
  if (report.loaded.length === 0) {
    console.log(`  (no skills found in ${skillsDir()})`);
  }
  for (const skill of report.loaded) {
    const tools = skill.tools.length > 0 ? ` — tools: ${skill.tools.join(", ")}` : "";
    console.log(`  ${skill.enabled ? "●" : "○"} ${skill.id}${tools}`);
  }
  for (const problem of report.problems) {
    console.log(`  ✘ ${problem.dir}: ${problem.message}`);
  }
}

/** Hot-reloads skills on the running daemon; falls back to a local validation pass. */
export async function runSkillsReload(): Promise<void> {
  const config = loadConfig();
  const token = readToken();
  const base = `http://${config.gateway.host}:${config.gateway.port}`;

  if (token) {
    try {
      const res = await fetch(`${base}/skills/reload`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      const body = (await res.json()) as { success: boolean; data?: ReloadReport; error?: string };
      if (res.ok && body.success && body.data) {
        printReport(body.data, `Reloaded on the running daemon (${base}):`);
        return;
      }
      console.error(`Daemon returned ${res.status}: ${body.error ?? "unknown error"}`);
    } catch {
      // daemon not running — fall through to local validation
    }
  }

  const db = openDb();
  try {
    const result = loadSkills({
      db,
      config,
      broker: new ApprovalBroker(db),
      builtinTools: buildBuiltinTools(),
    });
    printReport(
      {
        loaded: result.skills.map((s) => ({
          id: s.id,
          enabled: s.enabled,
          tools: s.tools.map((t) => t.name),
        })),
        problems: result.problems,
      },
      "Daemon not reachable — validated locally (the daemon loads these on next start):",
    );
  } finally {
    db.close();
  }
}
