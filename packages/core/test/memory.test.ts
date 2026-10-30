import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { remember, searchMemory, newestMemories, deleteMemory, countMemories } from "../src/memory.js";
import type { Db } from "../src/db.js";
import { makeDb } from "./helpers.js";

let db: Db;

beforeEach(() => {
  db = makeDb();
});

afterEach(() => {
  db.close();
});

describe("memory (FTS5)", () => {
  it("stores and finds memories by content words", () => {
    remember(db, "Akhil prefers oat milk in coffee");
    remember(db, "The staging server is at staging.example.com");

    const hits = searchMemory(db, "oat coffee");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toContain("oat milk");
  });

  it("survives FTS5 syntax characters in queries", () => {
    remember(db, "quarterly report due friday");
    expect(() => searchMemory(db, 'report "OR" NEAR( friday')).not.toThrow();
    expect(searchMemory(db, 'report friday')).toHaveLength(1);
  });

  it("returns newest first for recall", () => {
    for (let i = 0; i < 60; i++) remember(db, `fact number ${i}`);
    const newest = newestMemories(db, 50);
    expect(newest).toHaveLength(50);
    expect(newest[0]!.text).toBe("fact number 59");
  });

  it("deletes memories by id", () => {
    const m = remember(db, "temporary fact");
    expect(countMemories(db)).toBe(1);
    expect(deleteMemory(db, m.id)).toBe(true);
    expect(countMemories(db)).toBe(0);
    expect(deleteMemory(db, 999)).toBe(false);
  });

  it("rejects empty text", () => {
    expect(() => remember(db, "   ")).toThrow();
  });
});
