import { test, expect } from "@playwright/test";

const GATEWAY_URL = "http://127.0.0.1:4821";
const TOKEN = "e2e-test-token-0123456789abcdef";

test.describe.configure({ mode: "serial" });

test("pairing: connect to the harness gateway", async ({ page }) => {
  await page.goto("/");

  // Unpaired browsers land on the pairing screen.
  await expect(page.getByLabel("Gateway URL")).toBeVisible();

  await page.getByLabel("Gateway URL").fill(GATEWAY_URL);
  await page.getByLabel("Bearer token").fill(TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();

  // The rail renders once paired.
  await expect(page.getByText("JARVIS", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});

test.describe("paired flows", () => {
  test.beforeEach(async ({ page }) => {
    // Seed pairing before any page script runs — robust even in a fresh context.
    await page.addInitScript(
      ([url, token]) => {
        window.localStorage.setItem("jarvis.gatewayUrl", url as string);
        window.localStorage.setItem("jarvis.token", token as string);
      },
      [GATEWAY_URL, TOKEN],
    );
  });

  test("chat: streamed turn pauses on approval and resumes", async ({ page }) => {
    await page.goto("/chat");

    const input = page.getByLabel("Chat message");
    await expect(input).toBeEnabled();
    await input.fill("send the webhook");
    await input.press("Enter");

    // The scripted model calls webhook_post (outbound) → inline approval card.
    await expect(page.getByText("webhook_post").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("approval required")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();

    // After approval the same socket streams the closing text.
    await expect(page.getByText("Done — webhook sent.")).toBeVisible({ timeout: 15_000 });
  });

  test("audit: webhook_post recorded with status ok", async ({ page }) => {
    await page.goto("/audit");

    const row = page
      .getByRole("row")
      .filter({ hasText: "webhook_post" })
      .filter({ hasText: "ok" });
    await expect(row.first()).toBeVisible({ timeout: 15_000 });
  });
});
