import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultConfig, loadConfig, saveConfig, resolveApiKey } from "../src/config.js";
import { configPath } from "../src/paths.js";
import { generateToken, readToken, verifyToken } from "../src/token.js";
import { makeTempHome } from "./helpers.js";

let env: ReturnType<typeof makeTempHome>;

beforeEach(() => {
  env = makeTempHome();
});

afterEach(() => {
  env.restore();
});

describe("config", () => {
  it("returns defaults when no file exists", () => {
    const config = loadConfig();
    expect(config.provider.type).toBe("anthropic");
    expect(config.gateway.host).toBe("127.0.0.1");
    expect(config.webhookWhitelist).toEqual([]);
  });

  it("round-trips through save/load", () => {
    const config = defaultConfig();
    config.assistantName = "Friday";
    config.webhookWhitelist = ["https://hooks.example.com/"];
    saveConfig(config);
    expect(fs.existsSync(configPath())).toBe(true);
    const loaded = loadConfig();
    expect(loaded.assistantName).toBe("Friday");
    expect(loaded.webhookWhitelist).toEqual(["https://hooks.example.com/"]);
  });

  it("rejects invalid config files loudly", () => {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ provider: { type: "nonsense" } }));
    expect(() => loadConfig()).toThrow(/Invalid config/);
  });

  it("never stores API keys — resolves them from the named env var", () => {
    const config = defaultConfig();
    config.provider.apiKeyEnv = "JARVIS_TEST_KEY_VAR";
    delete process.env.JARVIS_TEST_KEY_VAR;
    expect(resolveApiKey(config)).toBeUndefined();
    process.env.JARVIS_TEST_KEY_VAR = "sk-test-123";
    expect(resolveApiKey(config)).toBe("sk-test-123");
    saveConfig(config);
    expect(fs.readFileSync(configPath(), "utf8")).not.toContain("sk-test-123");
    delete process.env.JARVIS_TEST_KEY_VAR;
  });
});

describe("gateway token", () => {
  it("generates, reads, and verifies tokens; rotation invalidates", () => {
    expect(readToken()).toBeUndefined();
    const token = generateToken();
    expect(readToken()).toBe(token);
    expect(verifyToken(token)).toBe(true);
    expect(verifyToken("wrong")).toBe(false);
    const rotated = generateToken();
    expect(verifyToken(token)).toBe(false);
    expect(verifyToken(rotated)).toBe(true);
  });
});
