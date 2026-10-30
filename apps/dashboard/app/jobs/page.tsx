"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cronToHuman } from "@/lib/cron";
import type { JobRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { JobEditor } from "@/components/JobEditor";
import { PageHeader } from "@/components/PageHeader";
import { Toast, useToast } from "@/components/Toast";

const DEFAULT_CRON = "0 7 * * *";

function kebabId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  const load = useCallback(() => {
    api.get<JobRow[]>("/jobs").then(setJobs).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (draft: JobRow) => {
    setBusy(true);
    try {
      await api.put(`/jobs/${draft.id}`, {
        cron: draft.cron,
        prompt: draft.prompt,
        channel: draft.channel,
        enabled: draft.enabled,
      });
      show("success", `Saved ${draft.id}`);
      setEditingId(null);
      load();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.del(`/jobs/${id}`);
      show("success", `Deleted ${id}`);
      setConfirmingId(null);
      load();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const addJob = () => {
    const id = kebabId(newName);
    if (!id) return;
    if (jobs.some((job) => job.id === id)) {
      show("error", `A job named ${id} already exists`);
      return;
    }
    const draft: JobRow = {
      id,
      cron: DEFAULT_CRON,
      prompt: "",
      channel: "telegram",
      enabled: false,
    };
    // Local-only until first save — the PUT creates it on the gateway.
    setJobs((current) => [...current, draft]);
    setEditingId(id);
    setNewName("");
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        meta="Cron-scheduled prompts, run by the gateway"
        actions={
          <div className="flex items-center gap-2">
            <input
              className="field w-44"
              placeholder="new job name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addJob();
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={addJob}
              disabled={!kebabId(newName)}
            >
              Add job
            </button>
          </div>
        }
      />

      {jobs.length === 0 ? (
        <div className="fade-up border border-line px-5">
          <EmptyState glyph="::" message="No jobs scheduled. Add one to put the agent on a clock." />
        </div>
      ) : (
        <div className="fade-up overflow-x-auto border border-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Cron</th>
                <th>Channel</th>
                <th>Enabled</th>
                <th className="w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr>
                    <td className="font-medium">{job.id}</td>
                    <td>
                      <span>{job.cron}</span>
                      {cronToHuman(job.cron) ? (
                        <span className="ml-2 text-ink-60">{cronToHuman(job.cron)}</span>
                      ) : null}
                    </td>
                    <td>{job.channel}</td>
                    <td>
                      <span className={`chip ${job.enabled ? "chip-ok" : "chip-neutral"}`}>
                        {job.enabled ? "on" : "off"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary text-[12px]"
                          onClick={() =>
                            setEditingId((current) => (current === job.id ? null : job.id))
                          }
                        >
                          {editingId === job.id ? "Close" : "Edit"}
                        </button>
                        {confirmingId === job.id ? (
                          <button
                            type="button"
                            className="btn btn-danger text-[12px]"
                            disabled={busy}
                            onClick={() => remove(job.id)}
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary text-[12px]"
                            onClick={() => setConfirmingId(job.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === job.id ? (
                    <tr>
                      <td colSpan={5} className="!p-0">
                        <JobEditor
                          job={job}
                          busy={busy}
                          onSave={save}
                          onCancel={() => {
                            setEditingId(null);
                            load();
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
