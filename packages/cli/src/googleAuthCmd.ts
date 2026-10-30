import { loadConfig } from "@jarvis/core";
import { runGoogleAuthFlow } from "@jarvis/tools";

export async function runGoogleAuth(): Promise<void> {
  const config = loadConfig();
  try {
    await runGoogleAuthFlow(config, (url: string) => {
      console.log("Open this URL to authorize Google access:");
      console.log(url);
    });
    console.log("Google account connected — tokens cached locally.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
