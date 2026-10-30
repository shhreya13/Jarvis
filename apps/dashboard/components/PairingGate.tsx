"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { validatePairing, ApiError } from "@/lib/api";
import {
  DEFAULT_GATEWAY_URL,
  clearPairing,
  getPairing,
  normalizeGatewayUrl,
  savePairing,
  type Pairing,
} from "@/lib/pairing";

interface PairingContextValue {
  pairing: Pairing;
  disconnect: () => void;
}

const PairingContext = createContext<PairingContextValue | null>(null);

export function usePairing(): PairingContextValue {
  const ctx = useContext(PairingContext);
  if (!ctx) throw new Error("usePairing must be used inside <PairingGate>");
  return ctx;
}

/**
 * Wraps every page. Unpaired browsers get the pairing screen; paired ones get
 * the console with pairing details available via usePairing().
 */
export function PairingGate({ children }: { children: ReactNode }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPairing(getPairing());
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (!pairing) {
    return (
      <PairingScreen
        onPaired={(next) => {
          savePairing(next);
          setPairing(getPairing());
        }}
      />
    );
  }

  const disconnect = () => {
    clearPairing();
    setPairing(null);
  };

  return (
    <PairingContext.Provider value={{ pairing, disconnect }}>
      {children}
    </PairingContext.Provider>
  );
}

function PairingScreen({ onPaired }: { onPaired: (pairing: Pairing) => void }) {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = normalizeGatewayUrl(gatewayUrl);
      await validatePairing(url, token.trim());
      onPaired({ gatewayUrl: url, token: token.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="fade-up w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-medium tracking-[0.2em]">
              JARVIS
            </span>
            <span className="led led-err" aria-hidden="true" />
          </div>
          <p className="micro-label mt-2">Operator console — not paired</p>
        </div>

        <form onSubmit={submit} className="border border-line bg-paper-2/60 p-6">
          <label className="micro-label block" htmlFor="gateway-url">
            Gateway URL
          </label>
          <input
            id="gateway-url"
            className="field mt-1.5 font-mono"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="http://127.0.0.1:4820"
            autoComplete="off"
            spellCheck={false}
          />

          <label className="micro-label mt-5 block" htmlFor="gateway-token">
            Bearer token
          </label>
          <input
            id="gateway-token"
            className="field mt-1.5 font-mono"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="output of `jarvis token`"
            autoComplete="off"
          />

          {error ? (
            <p className="mt-4 border border-signal/40 bg-signal/5 px-3 py-2 text-[13px] text-signal">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary mt-6 w-full justify-center"
            disabled={busy || !gatewayUrl.trim() || !token.trim()}
          >
            {busy ? "Checking…" : "Connect"}
          </button>
        </form>

        <p className="mt-6 text-[12px] leading-relaxed text-ink-60">
          The token stays in this browser. Point the URL at a local daemon or a
          private tunnel (e.g. cloudflared) when the console is deployed
          remotely.
        </p>
      </div>
    </main>
  );
}
