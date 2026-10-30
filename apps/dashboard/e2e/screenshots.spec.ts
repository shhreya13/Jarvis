import { test } from "@playwright/test";

const GATEWAY_URL = "http://127.0.0.1:4821";
const TOKEN = "e2e-test-token-0123456789abcdef";

// Visual artifacts only — run with: pnpm test:e2e --grep screenshots
test.describe("screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([url, token]) => {
        window.localStorage.setItem("jarvis.gatewayUrl", url as string);
        window.localStorage.setItem("jarvis.token", token as string);
      },
      [GATEWAY_URL, TOKEN],
    );
  });

  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 375, 812],
  ] as const) {
    test(`overview + approvals + settings @${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const [route, slug] of [
        ["/", "overview"],
        ["/approvals", "approvals"],
        ["/settings", "settings"],
      ] as const) {
        await page.goto(route);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `test-results/shot-${slug}-${name}.png`, fullPage: false });
      }
    });
  }
});
