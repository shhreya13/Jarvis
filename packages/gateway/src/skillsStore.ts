import type { Db } from "@jarvis/core";

export interface SkillRow {
  id: string;
  path: string;
  enabled: boolean;
  permissions: string[];
}

interface RawSkillRow {
  id: string;
  path: string;
  enabled: number;
  permissions_json: string;
}

export function listSkillRows(db: Db): SkillRow[] {
  const rows = db.prepare(`SELECT * FROM skills ORDER BY id`).all() as RawSkillRow[];
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    enabled: r.enabled === 1,
    permissions: JSON.parse(r.permissions_json) as string[],
  }));
}

export function setSkillEnabled(db: Db, id: string, enabled: boolean): boolean {
  return db.prepare(`UPDATE skills SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id).changes > 0;
}
