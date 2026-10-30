import type { Db } from "./db.js";

export interface Memory {
  id: number;
  text: string;
  created_at: number;
}

interface MemoryRow {
  rowid: number;
  text: string;
  created_at: number;
}

function toMemory(row: MemoryRow): Memory {
  return { id: row.rowid, text: row.text, created_at: row.created_at };
}

export function remember(db: Db, text: string): Memory {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Cannot remember empty text");
  const result = db
    .prepare(`INSERT INTO memories (text, created_at) VALUES (?, ?)`)
    .run(trimmed, Date.now());
  return { id: Number(result.lastInsertRowid), text: trimmed, created_at: Date.now() };
}

/** Escapes user text into a safe FTS5 query: every term quoted, ANDed together. */
function toFtsQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/"/g, "").trim())
    .filter((t) => t.length > 0);
  if (terms.length === 0) return '""';
  return terms.map((t) => `"${t}"`).join(" ");
}

export function searchMemory(db: Db, query: string, limit = 10): Memory[] {
  const rows = db
    .prepare(
      `SELECT rowid, text, created_at FROM memories WHERE memories MATCH ? ORDER BY bm25(memories) LIMIT ?`,
    )
    .all(toFtsQuery(query), limit) as MemoryRow[];
  return rows.map(toMemory);
}

export function newestMemories(db: Db, limit = 50): Memory[] {
  const rows = db
    .prepare(`SELECT rowid, text, created_at FROM memories ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(limit) as MemoryRow[];
  return rows.map(toMemory);
}

export function listMemories(db: Db, limit = 100, offset = 0): Memory[] {
  const rows = db
    .prepare(
      `SELECT rowid, text, created_at FROM memories ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as MemoryRow[];
  return rows.map(toMemory);
}

export function deleteMemory(db: Db, id: number): boolean {
  const result = db.prepare(`DELETE FROM memories WHERE rowid = ?`).run(id);
  return result.changes > 0;
}

export function countMemories(db: Db): number {
  const row = db.prepare(`SELECT count(*) AS n FROM memories`).get() as { n: number };
  return row.n;
}
