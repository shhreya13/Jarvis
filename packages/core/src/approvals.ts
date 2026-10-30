import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import type { Db } from "./db.js";
import type { Risk } from "./toolTypes.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "executed";

export interface ApprovalAction {
  tool: string;
  args: unknown;
  source: string;
  risk: Risk;
  sessionId?: string;
}

export interface ApprovalRow {
  id: string;
  action_json: string;
  status: ApprovalStatus;
  created_at: number;
  decided_at: number | null;
}

export type ApprovalDecision = "approved" | "denied" | "pending";

/**
 * Single choke point for human-in-the-loop approvals. Emits:
 *  - "pending"  (row) when a new approval is requested
 *  - "decided"  (row) when a human approves/denies
 * Channels (CLI prompt, Telegram buttons, dashboard) subscribe to "pending" and
 * call decide(); the agent loop awaits waitForDecision().
 */
export class ApprovalBroker extends EventEmitter {
  private readonly waiters = new Set<string>();

  constructor(private readonly db: Db) {
    super();
  }

  /**
   * True while an agent loop is blocked on waitForDecision for this approval.
   * Out-of-band deciders (gateway/Telegram) replay the stored action only when
   * no waiter is attached — otherwise the resumed loop executes it.
   */
  hasWaiter(id: string): boolean {
    return this.waiters.has(id);
  }

  create(action: ApprovalAction): ApprovalRow {
    const id = crypto.randomUUID();
    this.db
      .prepare(`INSERT INTO approvals (id, action_json, status, created_at) VALUES (?, ?, 'pending', ?)`)
      .run(id, JSON.stringify(action), Date.now());
    const row = this.get(id);
    if (!row) throw new Error("approval insert failed");
    this.emit("pending", row);
    return row;
  }

  get(id: string): ApprovalRow | undefined {
    return this.db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as
      | ApprovalRow
      | undefined;
  }

  listPending(): ApprovalRow[] {
    return this.db
      .prepare(`SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC`)
      .all() as ApprovalRow[];
  }

  list(limit = 50): ApprovalRow[] {
    return this.db
      .prepare(`SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as ApprovalRow[];
  }

  /** Human decision. No-op (returns current row) if already decided. */
  decide(id: string, approved: boolean): ApprovalRow | undefined {
    const row = this.get(id);
    if (!row || row.status !== "pending") return row;
    this.db
      .prepare(`UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?`)
      .run(approved ? "approved" : "denied", Date.now(), id);
    const updated = this.get(id);
    if (updated) this.emit("decided", updated);
    return updated;
  }

  /** Marks an approved action as executed so it can never run twice. */
  markExecuted(id: string): void {
    this.db
      .prepare(`UPDATE approvals SET status = 'executed' WHERE id = ? AND status = 'approved'`)
      .run(id);
  }

  parseAction(row: ApprovalRow): ApprovalAction {
    return JSON.parse(row.action_json) as ApprovalAction;
  }

  /**
   * Resolves with the decision, or "pending" after timeoutMs (pass Infinity to
   * wait forever — interactive channels do).
   */
  waitForDecision(id: string, timeoutMs: number): Promise<ApprovalDecision> {
    const current = this.get(id);
    if (current && current.status !== "pending") {
      return Promise.resolve(current.status === "denied" ? "denied" : "approved");
    }
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      this.waiters.add(id);
      const onDecided = (row: ApprovalRow): void => {
        if (row.id !== id) return;
        cleanup();
        resolve(row.status === "denied" ? "denied" : "approved");
      };
      const cleanup = (): void => {
        this.off("decided", onDecided);
        this.waiters.delete(id);
        if (timer) clearTimeout(timer);
      };
      this.on("decided", onDecided);
      if (Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          cleanup();
          resolve("pending");
        }, timeoutMs);
        timer.unref?.();
      }
    });
  }
}
