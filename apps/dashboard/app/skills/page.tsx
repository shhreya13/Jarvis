"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SkillRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Toast, useToast } from "@/components/Toast";

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, show } = useToast();

  const load = useCallback(() => {
    api.get<SkillRow[]>("/skills").then(setSkills).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (skill: SkillRow) => {
    setBusyId(skill.id);
    try {
      await api.post(`/skills/${skill.id}`, { enabled: !skill.enabled });
      setSkills((current) =>
        current.map((row) =>
          row.id === skill.id ? { ...row, enabled: !skill.enabled } : row,
        ),
      );
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Skills" meta="Local skill folders the agent can draw on" />

      <p className="fade-up mb-6 max-w-xl border-l-2 border-line pl-3 text-[13px] text-ink-60">
        Skills are local folders in <span className="font-mono">~/.jarvis/skills</span> —
        remote installation is deliberately unsupported.
      </p>

      {skills.length === 0 ? (
        <div className="fade-up border border-line px-5">
          <EmptyState
            glyph="+"
            message="No skills found. Drop a skill folder into ~/.jarvis/skills on the gateway machine."
          />
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
          {skills.map((skill) => (
            <article key={skill.id} className="border border-line bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-medium">{skill.id}</h2>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-60" title={skill.path}>
                    {skill.path}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={skill.enabled}
                  aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.id}`}
                  className={`btn text-[12px] ${skill.enabled ? "btn-approve" : "btn-secondary"}`}
                  disabled={busyId === skill.id}
                  onClick={() => toggle(skill)}
                >
                  {skill.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              {skill.permissions.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {skill.permissions.map((permission) => (
                    <li key={permission} className="chip chip-neutral">
                      {permission}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 font-mono text-[11px] text-ink-60">no tool permissions</p>
              )}
            </article>
          ))}
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
