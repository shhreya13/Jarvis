import fs from "node:fs";
import http from "node:http";
import { google } from "googleapis";
import type { Auth } from "googleapis";
import { ensureDirs, googleTokenPath, type Config } from "@jarvis/core";

export const GOOGLE_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const AUTH_FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_FILE_MODE = 0o600;

const SUCCESS_PAGE =
  "<!doctype html><meta charset=\"utf-8\"><title>Jarvis</title>" +
  "<body style=\"font-family:sans-serif;padding:2rem\">" +
  "<h1>Signed in</h1><p>Jarvis is now connected to Google. You can close this tab.</p></body>";

interface GoogleClientCredentials {
  clientId: string;
  clientSecret: string;
}

function requireClientCredentials(config: Config): GoogleClientCredentials {
  const clientId = config.google.clientId;
  const clientSecret = process.env[config.google.clientSecretEnv] ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth is not configured. Set "google.clientId" in ~/.jarvis/config.json to your ' +
        "OAuth client ID and export the client secret in the " +
        `${config.google.clientSecretEnv} environment variable.`,
    );
  }
  return { clientId, clientSecret };
}

function saveTokens(tokens: Auth.Credentials): void {
  ensureDirs();
  const file = googleTokenPath();
  fs.writeFileSync(file, `${JSON.stringify(tokens, null, 2)}\n`, { mode: TOKEN_FILE_MODE });
  fs.chmodSync(file, TOKEN_FILE_MODE);
}

function readTokens(): Auth.Credentials {
  return JSON.parse(fs.readFileSync(googleTokenPath(), "utf8")) as Auth.Credentials;
}

/**
 * Builds an authenticated OAuth2 client from config + the cached token file.
 * Refreshed tokens are merged into and persisted back to the token file.
 * Throws when OAuth is unconfigured or the user has not run `jarvis google-auth`.
 */
export function getGoogleAuth(config: Config): Auth.OAuth2Client {
  const credentials = requireClientCredentials(config);
  if (!fs.existsSync(googleTokenPath())) {
    throw new Error("Not authenticated with Google — run `jarvis google-auth` first.");
  }
  const client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  client.setCredentials(readTokens());
  client.on("tokens", (refreshed) => {
    let existing: Auth.Credentials = {};
    try {
      existing = readTokens();
    } catch {
      // Token file vanished or is unreadable — persist the refreshed credentials alone.
    }
    saveTokens({ ...existing, ...refreshed });
  });
  return client;
}

/**
 * Runs the installed-app loopback OAuth flow: starts a local callback server on
 * 127.0.0.1, passes the consent URL to `onAuthUrl` (the CLI prints it), waits
 * for Google to redirect back, exchanges the code, and saves the tokens with
 * mode 0600. Rejects after 5 minutes without a callback.
 */
export function runGoogleAuthFlow(config: Config, onAuthUrl: (url: string) => void): Promise<void> {
  const credentials = requireClientCredentials(config);
  return new Promise<void>((resolve, reject) => {
    let client: Auth.OAuth2Client | null = null;
    let port = 0;
    let settled = false;

    const server = http.createServer((req, res) => {
      void handleCallback(req, res);
    });

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Google authorization timed out after 5 minutes.")));
    }, AUTH_FLOW_TIMEOUT_MS);

    function finish(settle: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      settle();
    }

    async function handleCallback(
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ): Promise<void> {
      const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (requestUrl.pathname !== "/callback" || client === null) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const oauthError = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      if (oauthError !== null || code === null) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Authorization failed. You can close this tab.");
        finish(() => reject(new Error(`Google authorization failed: ${oauthError ?? "no code returned"}`)));
        return;
      }
      try {
        const { tokens } = await client.getToken(code);
        saveTokens(tokens);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(SUCCESS_PAGE);
        finish(resolve);
      } catch (error: unknown) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Token exchange failed. You can close this tab.");
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    }

    server.on("error", (error) => {
      finish(() => reject(error));
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        finish(() => reject(new Error("Could not determine the local callback port for Google auth.")));
        return;
      }
      port = address.port;
      client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        `http://127.0.0.1:${port}/callback`,
      );
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [...GOOGLE_SCOPES],
      });
      onAuthUrl(authUrl);
    });
  });
}
