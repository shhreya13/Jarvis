"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cronToHuman } from "@/lib/cron";
import { relativeTime } from "@/lib/time";
import type { ApprovalRow, JobRow, MemoryRow, SessionRow } from "@/lib/types";
import { useWs } from "@/lib/ws";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

const SESSIONS_SHOWN = 6;
const JOBS_SHOWN = 6;

export default function OverviewPage() {
  const { subscribe, refreshPending } = useWs();
  const [pending, setPending] = useState<ApprovalRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);

  const loadPending = useCallback(() => {
    api.get<ApprovalRow[]>("/approvals?status=pending").then(setPending).catch(() => {});
  }, []);

  useEffect(() => {
    loadPending();
    api.get<JobRow[]>("/jobs").then(setJobs).catch(() => {});
    api.get<SessionRow[]>("/sessions").then(setSessions).catch(() => {});
    api.get<MemoryRow[]>("/memories?limit=500").then(setMemories).catch(() => {});
  }, [loadPending]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "approval-pending" || event.type === "approval-decided") {
          loadPending();
        }
      }),
    [subscribe, loadPending],
  );

  return (
    <>
      <PageHeader title="Overview" meta="Instrument panel for the paired gateway" />

      <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Pending approvals — the accent card, spans 2 columns */}
        <section
          aria-labelledby="overview-approvals"
          className={`md:col-span-2 border p-5 ${
            pending.length > 0 ? "border-signal/60" : "border-line"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <h2 id="overview-approvals" className="micro-label">
              Pending approvals
            </h2>
            <Link href="/approvals" className="text-[12px] text-ink-60 hover:text-ink">
              All approvals →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <EmptyState glyph="[ ]" message="Nothing waiting on you. The agent is inside its lane." />
            ) : (
              pending.map((row) => (
                <ApprovalCard
                  key={row.id}
                  row={row}
                  compact
                  onDecided={() => {
                    loadPending();
                    refreshPending();
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* Next jobs */}
        <section aria-labelledby="overview-jobs" className="border border-line p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="overview-jobs" className="micro-label">
              Jobs
            </h2>
            <Link href="/jobs" className="text-[12px] text-ink-60 hover:text-ink">
              Manage →
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {jobs.length === 0 ? (
              <EmptyState glyph="::" message="No scheduled jobs yet." />
            ) : (
              jobs.slice(0, JOBS_SHOWN).map((job) => (
                <li key={job.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px]">{job.id}</p>
                    <p className="font-mono text-[11px] text-ink-60">
                      {job.cron}
                      {cronToHuman(job.cron) ? ` — ${cronToHuman(job.cron)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`chip ${job.enabled ? "chip-ok" : "chip-neutral"}`}
                  >
                    {job.enabled ? "on" : "off"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Recent sessions */}
        <section
          aria-labelledby="overview-sessions"
          className="border border-line p-5 md:col-span-2"
        >
          <div className="flex items-baseline justify-between">
            <h2 id="overview-sessions" className="micro-label">
              Recent sessions
            </h2>
            <Link href="/chat" className="text-[12px] text-ink-60 hover:text-ink">
              Open chat →
            </Link>
          </div>
          {sessions.length === 0 ? (
            <EmptyState glyph="//" message="No conversations yet — say hello in Chat." />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {sessions.slice(0, SESSIONS_SHOWN).map((session) => (
                <li key={session.id} className="flex items-center gap-3 py-2 first:pt-0">
                  <span className="chip chip-neutral">{session.channel}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {session.title ?? session.id}
                  </span>
                  <span className="font-mono text-[11px] text-ink-60">
                    {session.message_count} msg
                  </span>
                  <span className="w-16 text-right font-mono text-[11px] text-ink-60">
                    {relativeTime(session.updated_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Memory */}
        <section aria-labelledby="overview-memory" className="border border-line p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="overview-memory" className="micro-label">
              Memory
            </h2>
            <Link href="/memory" className="text-[12px] text-ink-60 hover:text-ink">
              Browse →
            </Link>
          </div>
          <p className="mt-3 font-mono text-2xl">{memories.length}</p>
          {memories.length === 0 ? (
            <EmptyState glyph="~" message="Nothing remembered yet." />
          ) : (
            <ul className="mt-3 space-y-2">
              {memories.slice(0, 3).map((memory) => (
                <li
                  key={memory.id}
                  className="line-clamp-2 border-l-2 border-line pl-2.5 text-[12px] text-ink-60"
                  title={memory.text}
                >
                  {memory.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
