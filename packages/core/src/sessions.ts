import crypto from "node:crypto";
import type { ModelMessage } from "ai";
import type { Db } from "./db.js";

export interface SessionRow {
  id: string;
  channel: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export function createSession(db: Db, channel: string, title?: string): SessionRow {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, channel, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, channel, title ?? null, now, now);
  return { id, channel, title: title ?? null, created_at: now, updated_at: now };
}

export function getSession(db: Db, id: string): SessionRow | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionRow | undefined;
}

/** Reuses the newest session for a channel (Telegram = one rolling conversation). */
export function getOrCreateChannelSession(db: Db, channel: string): SessionRow {
  const existing = db
    .prepare(`SELECT * FROM sessions WHERE channel = ? ORDER BY updated_at DESC LIMIT 1`)
    .get(channel) as SessionRow | undefined;
  return existing ?? createSession(db, channel);
}

export function listSessions(db: Db, limit = 20): (SessionRow & { message_count: number })[] {
  return db
    .prepare(
      `SELECT s.*, (SELECT count(*) FROM messages m WHERE m.session_id = s.id) AS message_count
       FROM sessions s ORDER BY s.updated_at DESC LIMIT ?`,
    )
    .all(limit) as (SessionRow & { message_count: number })[];
}

export function appendMessage(db: Db, sessionId: string, message: ModelMessage): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (session_id, role, content_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(sessionId, message.role, JSON.stringify(message), now);
  db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId);
}

export function loadMessages(db: Db, sessionId: string, limit = 200): ModelMessage[] {
  const rows = db
    .prepare(
      `SELECT content_json FROM (
         SELECT id, content_json FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`,
    )
    .all(sessionId, limit) as { content_json: string }[];
  return rows.map((r) => JSON.parse(r.content_json) as ModelMessage);
}
