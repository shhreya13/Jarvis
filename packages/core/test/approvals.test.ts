import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApprovalBroker } from "../src/approvals.js";
import type { Db } from "../src/db.js";
import { makeDb } from "./helpers.js";

let db: Db;
let broker: ApprovalBroker;

beforeEach(() => {
  db = makeDb();
  broker = new ApprovalBroker(db);
});

afterEach(() => {
  db.close();
});

const action = { tool: "webhook_post", args: { url: "https://x" }, source: "cli", risk: "outbound" as const };

describe("ApprovalBroker", () => {
  it("creates pending rows and emits 'pending'", () => {
    let emitted: unknown;
    broker.on("pending", (row) => (emitted = row));
    const row = broker.create(action);
    expect(row.status).toBe("pending");
    expect(emitted).toMatchObject({ id: row.id });
    expect(broker.listPending()).toHaveLength(1);
  });

  it("waitForDecision resolves on approve", async () => {
    const row = broker.create(action);
    const wait = broker.waitForDecision(row.id, 5_000);
    broker.decide(row.id, true);
    await expect(wait).resolves.toBe("approved");
  });

  it("waitForDecision resolves on deny", async () => {
    const row = broker.create(action);
    const wait = broker.waitForDecision(row.id, 5_000);
    broker.decide(row.id, false);
    await expect(wait).resolves.toBe("denied");
  });

  it("waitForDecision times out to 'pending' and leaves the row pending", async () => {
    const row = broker.create(action);
    await expect(broker.waitForDecision(row.id, 20)).resolves.toBe("pending");
    expect(broker.get(row.id)!.status).toBe("pending");
  });

  it("resolves immediately for already-decided approvals", async () => {
    const row = broker.create(action);
    broker.decide(row.id, false);
    await expect(broker.waitForDecision(row.id, 5_000)).resolves.toBe("denied");
  });

  it("double-decide is a no-op", () => {
    const row = broker.create(action);
    broker.decide(row.id, true);
    const after = broker.decide(row.id, false);
    expect(after!.status).toBe("approved");
  });

  it("tracks waiters so out-of-band deciders know whether to replay", async () => {
    const row = broker.create(action);
    expect(broker.hasWaiter(row.id)).toBe(false);
    const wait = broker.waitForDecision(row.id, 5_000);
    expect(broker.hasWaiter(row.id)).toBe(true);
    // Snapshot BEFORE decide — decide() resolves the waiter synchronously.
    const hadWaiter = broker.hasWaiter(row.id);
    broker.decide(row.id, true);
    await wait;
    expect(hadWaiter).toBe(true);
    expect(broker.hasWaiter(row.id)).toBe(false);
  });

  it("clears the waiter on timeout", async () => {
    const row = broker.create(action);
    await broker.waitForDecision(row.id, 15);
    expect(broker.hasWaiter(row.id)).toBe(false);
  });

  it("markExecuted only applies to approved rows", () => {
    const row = broker.create(action);
    broker.markExecuted(row.id);
    expect(broker.get(row.id)!.status).toBe("pending");
    broker.decide(row.id, true);
    broker.markExecuted(row.id);
    expect(broker.get(row.id)!.status).toBe("executed");
  });
});
