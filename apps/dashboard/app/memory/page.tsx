"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { isoDate } from "@/lib/time";
import type { MemoryRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

const DEBOUNCE_MS = 300;
const CONFIRM_RESET_MS = 4000;

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced search — empty query lists everything.
  useEffect(() => {
    const timer = setTimeout(() => {
      const path = query.trim()
        ? `/memories?query=${encodeURIComponent(query.trim())}&limit=200`
        : "/memories?limit=200";
      api
        .get<MemoryRow[]>(path)
        .then((data) => {
          setRows(data);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const beginConfirm = (id: number) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingId(id);
    confirmTimer.current = setTimeout(() => setConfirmingId(null), CONFIRM_RESET_MS);
  };

  const remove = async (id: number) => {
    try {
      await api.del(`/memories/${id}`);
      setRows((current) => current.filter((row) => row.id !== id));
      setConfirmingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Memory"
        meta={`${rows.length} ${query.trim() ? "matching" : "stored"} memor${rows.length === 1 ? "y" : "ies"}`}
      />

      <div className="fade-up mb-6 max-w-md">
        <label className="micro-label mb-1.5 block" htmlFor="memory-search">
          Search
        </label>
        <input
          id="memory-search"
          className="field font-mono"
          placeholder="full-text search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error ? <p className="mb-4 text-[13px] text-signal">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="border border-line px-5">
          <EmptyState
            glyph="~"
            message={
              query.trim()
                ? "Nothing matches that query."
                : "Nothing remembered yet. The agent stores facts here with the remember tool."
            }
          />
        </div>
      ) : (
        <ul className="stagger space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="border border-line bg-paper p-4">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{row.text}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] text-ink-60">
                  #{row.id} · {isoDate(row.created_at)}
                </span>
                {confirmingId === row.id ? (
                  <button
                    type="button"
                    className="btn btn-danger text-[12px]"
                    onClick={() => remove(row.id)}
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary text-[12px]"
                    onClick={() => beginConfirm(row.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
