import Database from "better-sqlite3";
import { dbPath, ensureDirs } from "./paths.js";

export type Db = Database.Database;

/**
 * Append-only migration list. Never edit an entry after release — add a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_messages_session ON messages(session_id, id);

  CREATE VIRTUAL TABLE memories USING fts5(text, created_at UNINDEXED);

  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    source TEXT NOT NULL,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL,
    risk TEXT NOT NULL,
    status TEXT NOT NULL,
    result_summary TEXT
  );
  CREATE INDEX idx_audit_ts ON audit(ts DESC);

  CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    action_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  );

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    cron TEXT NOT NULL,
    prompt TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'telegram',
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    permissions_json TEXT NOT NULL DEFAULT '[]'
  );
  `,
];

export function migrate(db: Db): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
  );
  const rows = db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[];
  const applied = new Set(rows.map((r) => r.version));
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`).run(
        version,
        Date.now(),
      );
    });
    run();
  });
}

/** Opens (creating + migrating if needed) the Jarvis database. */
export function openDb(file?: string): Db {
  if (!file) {
    ensureDirs();
    file = dbPath();
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
