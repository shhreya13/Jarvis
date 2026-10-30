/**
 * Pairing = which gateway this console talks to, and with which bearer token.
 * Stored in localStorage only — the dashboard never proxies gateway traffic
 * through its own server, so the token never leaves the operator's browser.
 */

export interface Pairing {
  gatewayUrl: string;
  token: string;
}

const URL_KEY = "jarvis.gatewayUrl";
const TOKEN_KEY = "jarvis.token";

export const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4820";

export function normalizeGatewayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getPairing(): Pairing | null {
  if (typeof window === "undefined") return null;
  const gatewayUrl = window.localStorage.getItem(URL_KEY);
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!gatewayUrl || !token) return null;
  return { gatewayUrl, token };
}

export function savePairing(pairing: Pairing): void {
  window.localStorage.setItem(URL_KEY, normalizeGatewayUrl(pairing.gatewayUrl));
  window.localStorage.setItem(TOKEN_KEY, pairing.token);
}

export function clearPairing(): void {
  window.localStorage.removeItem(URL_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Host shown in the rail footer, e.g. "127.0.0.1:4820". */
export function gatewayHost(pairing: Pairing): string {
  try {
    return new URL(pairing.gatewayUrl).host;
  } catch {
    return pairing.gatewayUrl;
  }
}
