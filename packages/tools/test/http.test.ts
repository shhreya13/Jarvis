import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, openDb } from "@jarvis/core";
import type { Db, ToolContext } from "@jarvis/core";
import { httpRequestTool } from "../src/http.js";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

function args(url: string, method: Method = "GET") {
  return { url, method };
}

describe("http_request", () => {
  let db: Db;
  let ctx: ToolContext;

  beforeEach(() => {
    db = openDb(":memory:");
    ctx = { db, config: defaultConfig(), workspaceDir: os.tmpdir(), source: "cli" };
  });

  afterEach(() => {
    db.close();
  });

  describe("riskFor", () => {
    it("treats GET and HEAD as read", () => {
      const riskFor = httpRequestTool.riskFor;
      expect(riskFor).toBeTypeOf("function");
      expect(riskFor?.(args("https://example.com/", "GET"))).toBe("read");
      expect(riskFor?.(args("https://example.com/", "HEAD"))).toBe("read");
    });

    it("treats mutating methods as outbound", () => {
      const riskFor = httpRequestTool.riskFor;
      expect(riskFor?.(args("https://example.com/", "POST"))).toBe("outbound");
      expect(riskFor?.(args("https://example.com/", "PUT"))).toBe("outbound");
      expect(riskFor?.(args("https://example.com/", "PATCH"))).toBe("outbound");
      expect(riskFor?.(args("https://example.com/", "DELETE"))).toBe("outbound");
    });
  });

  describe("validate", () => {
    it("rejects loopback addresses", () => {
      const reason = httpRequestTool.validate?.(args("http://127.0.0.1:9999/x"), ctx);
      expect(reason).toBeTypeOf("string");
    });

    it("rejects localhost", () => {
      const reason = httpRequestTool.validate?.(args("http://localhost/"), ctx);
      expect(reason).toBeTypeOf("string");
    });

    it("rejects private network addresses", () => {
      const reason = httpRequestTool.validate?.(args("http://192.168.1.5/"), ctx);
      expect(reason).toBeTypeOf("string");
    });

    it("accepts public hosts", () => {
      const reason = httpRequestTool.validate?.(args("https://example.com"), ctx);
      expect(reason).toBeUndefined();
    });
  });
});
