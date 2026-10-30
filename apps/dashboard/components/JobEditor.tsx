"use client";

import { useState } from "react";
import { cronToHuman } from "@/lib/cron";
import type { JobRow } from "@/lib/types";

const CHANNELS = ["telegram", "none"] as const;

/** Inline editor drawer for one job. Saving PUTs the whole job document. */
export function JobEditor({
  job,
  busy,
  onSave,
  onCancel,
}: {
  job: JobRow;
  busy: boolean;
  onSave: (draft: JobRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<JobRow>(job);
  const hint = cronToHuman(draft.cron);

  const set = <K extends keyof JobRow>(key: K, value: JobRow[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="slide-in border-t border-line bg-paper-2/50 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="micro-label mb-1 block" htmlFor={`cron-${job.id}`}>
            Cron
          </label>
          <input
            id={`cron-${job.id}`}
            className="field font-mono"
            value={draft.cron}
            onChange={(e) => set("cron", e.target.value)}
            spellCheck={false}
          />
          <p className="mt-1 font-mono text-[11px] text-ink-60">
            {hint ?? "5-field cron expression"}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="micro-label mb-1 block" htmlFor={`channel-${job.id}`}>
              Channel
            </label>
            <select
              id={`channel-${job.id}`}
              className="field"
              value={draft.channel}
              onChange={(e) => set("channel", e.target.value)}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="micro-label mb-1 block">Enabled</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              className={`btn ${draft.enabled ? "btn-approve" : "btn-secondary"}`}
              onClick={() => set("enabled", !draft.enabled)}
            >
              {draft.enabled ? "On" : "Off"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="micro-label mb-1 block" htmlFor={`prompt-${job.id}`}>
          Prompt
        </label>
        <textarea
          id={`prompt-${job.id}`}
          className="field font-mono text-[12px]"
          rows={4}
          value={draft.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          placeholder="What should the agent do on this schedule?"
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !draft.cron.trim() || !draft.prompt.trim()}
          onClick={() => onSave(draft)}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
