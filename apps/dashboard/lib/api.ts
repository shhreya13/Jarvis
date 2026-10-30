import { getPairing, normalizeGatewayUrl } from "./pairing";

/** Gateway response envelope. */
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const pairing = getPairing();
  if (!pairing) throw new ApiError("Not paired with a gateway");

  let res: Response;
  try {
    res = await fetch(`${pairing.gatewayUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${pairing.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Gateway unreachable");
  }

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(`Bad response from gateway (HTTP ${res.status})`, res.status);
  }

  if (!res.ok || !body.success) {
    throw new ApiError(body.error ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  return body.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** ws(s):// URL for the paired gateway, with the token as a query param. */
export function wsUrl(): string | null {
  const pairing = getPairing();
  if (!pairing) return null;
  const base = pairing.gatewayUrl.replace(/^http/, "ws");
  return `${base}/ws?token=${encodeURIComponent(pairing.token)}`;
}

/** Unauthenticated liveness probe. Used by pairing and the rail LED. */
export async function checkHealth(gatewayUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${normalizeGatewayUrl(gatewayUrl)}/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

/**
 * Full pairing validation: /health proves the gateway is there, /config with
 * the token proves the token is right. Throws ApiError with a human message.
 */
export async function validatePairing(gatewayUrl: string, token: string): Promise<void> {
  const url = normalizeGatewayUrl(gatewayUrl);
  const healthy = await checkHealth(url);
  if (!healthy) {
    throw new ApiError("No gateway answering at that URL — is the daemon running?");
  }
  let res: Response;
  try {
    res = await fetch(`${url}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError("Gateway reachable but the config check failed");
  }
  if (res.status === 401) {
    throw new ApiError("Gateway rejected the token — check `jarvis token` output");
  }
  if (!res.ok) {
    throw new ApiError(`Unexpected gateway response (HTTP ${res.status})`);
  }
}
