"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { GatewayConfig } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Toast, useToast } from "@/components/Toast";
import { ToolMatrix } from "@/components/ToolMatrix";

const TOP_LEVEL_KEYS = [
  "assistantName",
  "userName",
  "provider",
  "telegram",
  "webhookWhitelist",
  "approvalTimeoutMs",
] as const;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-paper p-5">
      <h2 className="micro-label mb-4">{label}</h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="micro-label mb-1 block" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<GatewayConfig | null>(null);
  const [draft, setDraft] = useState<GatewayConfig | null>(null);
  const [whitelistInput, setWhitelistInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    api
      .get<GatewayConfig>("/config")
      .then((config) => {
        setSaved(config);
        setDraft(config);
      })
      .catch((err) => show("error", err instanceof Error ? err.message : "Config load failed"));
  }, [show]);

  if (!draft || !saved) {
    return (
      <>
        <PageHeader title="Settings" meta="Gateway configuration" />
        <p className="font-mono text-[13px] text-ink-60">Loading config…</p>
        <Toast toast={toast} />
      </>
    );
  }

  const set = <K extends keyof GatewayConfig>(key: K, value: GatewayConfig[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const setProvider = (patch: Partial<GatewayConfig["provider"]>) =>
    set("provider", { ...draft.provider, ...patch });

  const setTelegram = (patch: Partial<GatewayConfig["telegram"]>) =>
    set("telegram", { ...draft.telegram, ...patch });

  const addWhitelist = () => {
    const value = whitelistInput.trim();
    if (!value) return;
    if (draft.webhookWhitelist.includes(value)) return;
    set("webhookWhitelist", [...draft.webhookWhitelist, value]);
    setWhitelistInput("");
  };

  const changedKeys = TOP_LEVEL_KEYS.filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]),
  );

  const save = async () => {
    if (changedKeys.length === 0) return;
    setBusy(true);
    try {
      const patch = Object.fromEntries(changedKeys.map((key) => [key, draft[key]]));
      const next = await api.put<GatewayConfig>("/config", patch);
      setSaved(next);
      setDraft(next);
      show("success", `Saved ${changedKeys.join(", ")}`);
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Save rejected by gateway");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        meta="Changes apply to the running gateway on save"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || changedKeys.length === 0}
            onClick={save}
          >
            {busy ? "Saving…" : changedKeys.length > 0 ? `Save (${changedKeys.length})` : "Saved"}
          </button>
        }
      />

      <div className="stagger space-y-5">
        <Section label="Identity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="assistant-name" label="Assistant name">
              <input
                id="assistant-name"
                className="field"
                value={draft.assistantName}
                onChange={(e) => set("assistantName", e.target.value)}
              />
            </Field>
            <Field id="user-name" label="Your name">
              <input
                id="user-name"
                className="field"
                value={draft.userName}
                onChange={(e) => set("userName", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section label="Provider">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field id="provider-type" label="Type">
              <select
                id="provider-type"
                className="field"
                value={draft.provider.type}
                onChange={(e) =>
                  setProvider({ type: e.target.value as GatewayConfig["provider"]["type"] })
                }
              >
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
                <option value="openai-compatible">openai-compatible</option>
              </select>
            </Field>
            <Field id="provider-model" label="Model">
              <input
                id="provider-model"
                className="field font-mono"
                value={draft.provider.model}
                onChange={(e) => setProvider({ model: e.target.value })}
                spellCheck={false}
              />
            </Field>
            <Field id="provider-key-env" label="API key env var">
              <input
                id="provider-key-env"
                className="field font-mono"
                value={draft.provider.apiKeyEnv}
                onChange={(e) => setProvider({ apiKeyEnv: e.target.value })}
                spellCheck={false}
              />
            </Field>
          </div>
          {draft.provider.type === "openai-compatible" ? (
            <div className="mt-4 max-w-md">
              <Field id="provider-base-url" label="Base URL">
                <input
                  id="provider-base-url"
                  className="field font-mono"
                  value={draft.provider.baseURL ?? ""}
                  onChange={(e) =>
                    setProvider({ baseURL: e.target.value || undefined })
                  }
                  placeholder="http://127.0.0.1:11434/v1"
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}
          <p className="mt-3 text-[12px] text-ink-60">
            Keys are read from env on the gateway machine, never stored.
          </p>
        </Section>

        <Section label="Telegram">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
            <div>
              <span className="micro-label mb-1 block">Enabled</span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.telegram.enabled}
                className={`btn ${draft.telegram.enabled ? "btn-approve" : "btn-secondary"}`}
                onClick={() => setTelegram({ enabled: !draft.telegram.enabled })}
              >
                {draft.telegram.enabled ? "On" : "Off"}
              </button>
            </div>
            <Field id="telegram-token-env" label="Bot token env var">
              <input
                id="telegram-token-env"
                className="field font-mono"
                value={draft.telegram.botTokenEnv}
                onChange={(e) => setTelegram({ botTokenEnv: e.target.value })}
                spellCheck={false}
              />
            </Field>
            <Field id="telegram-chat-id" label="Chat ID">
              <input
                id="telegram-chat-id"
                className="field font-mono"
                value={draft.telegram.chatId}
                onChange={(e) => setTelegram({ chatId: e.target.value })}
                spellCheck={false}
              />
            </Field>
          </div>
        </Section>

        <Section label="Tool permissions">
          <ToolMatrix />
        </Section>

        <Section label="Webhook whitelist">
          <p className="mb-3 text-[12px] text-ink-60">
            webhook_post may only target URLs starting with one of these prefixes.
          </p>
          {draft.webhookWhitelist.length === 0 ? (
            <p className="mb-3 font-mono text-[12px] text-ink-60">
              empty — webhook_post is fully blocked
            </p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {draft.webhookWhitelist.map((prefix) => (
                <li key={prefix} className="flex items-center gap-2">
                  <span className="flex-1 truncate border border-line bg-paper-2/60 px-2 py-1 font-mono text-[12px]">
                    {prefix}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary text-[12px]"
                    onClick={() =>
                      set(
                        "webhookWhitelist",
                        draft.webhookWhitelist.filter((p) => p !== prefix),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex max-w-md gap-2">
            <input
              className="field font-mono"
              placeholder="https://hooks.example.com/"
              value={whitelistInput}
              onChange={(e) => setWhitelistInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addWhitelist();
              }}
              spellCheck={false}
              aria-label="New webhook URL prefix"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addWhitelist}
              disabled={!whitelistInput.trim()}
            >
              Add
            </button>
          </div>
        </Section>

        <Section label="Approvals">
          <div className="max-w-xs">
            <Field id="approval-timeout" label="Approval timeout (ms)">
              <input
                id="approval-timeout"
                type="number"
                min={0}
                step={1000}
                className="field font-mono"
                value={draft.approvalTimeoutMs}
                onChange={(e) => set("approvalTimeoutMs", Number(e.target.value) || 0)}
              />
            </Field>
            <p className="mt-2 text-[12px] text-ink-60">
              How long non-interactive runs wait for a decision before queueing the action.
            </p>
          </div>
        </Section>
      </div>

      <Toast toast={toast} />
    </>
  );
}
