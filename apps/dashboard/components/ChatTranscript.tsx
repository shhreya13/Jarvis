"use client";

import type { AssistantTurn, ChatPart, ChatTurn } from "@/lib/chatTurns";
import { prettyArgs } from "./ApprovalCard";
import { RiskChip } from "./chips";

export function ChatTranscript({
  turns,
  busy,
  onDecide,
}: {
  turns: ChatTurn[];
  busy: boolean;
  onDecide: (approvalId: string, approve: boolean) => void;
}) {
  const lastAssistantIdx = turns.findLastIndex((t) => t.role === "assistant");

  return (
    <ol className="space-y-6">
      {turns.map((turn, i) => (
        <li key={i}>
          {turn.role === "user" ? (
            <UserTurn text={turn.text} />
          ) : turn.role === "notice" ? (
            <p className="border border-signal/40 bg-signal/5 px-3 py-2 font-mono text-[12px] text-signal">
              {turn.text}
            </p>
          ) : (
            <AssistantTurnView
              turn={turn}
              streaming={busy && i === lastAssistantIdx}
              onDecide={onDecide}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function UserTurn({ text }: { text: string }) {
  return (
    <div>
      <p className="micro-label mb-1">You</p>
      <p className="whitespace-pre-wrap border-l-2 border-ink/30 pl-3 text-[14px]">
        {text}
      </p>
    </div>
  );
}

function AssistantTurnView({
  turn,
  streaming,
  onDecide,
}: {
  turn: AssistantTurn;
  streaming: boolean;
  onDecide: (approvalId: string, approve: boolean) => void;
}) {
  const lastTextIdx = turn.parts.findLastIndex((p) => p.kind === "text");
  return (
    <div>
      <p className="micro-label mb-1">Jarvis</p>
      <div className="space-y-2">
        {turn.parts.length === 0 && streaming ? (
          <p className="text-[14px]">
            <span className="caret" aria-hidden="true" />
          </p>
        ) : null}
        {turn.parts.map((part, i) => (
          <PartView
            key={i}
            part={part}
            showCaret={streaming && i === lastTextIdx && i === turn.parts.length - 1}
            onDecide={onDecide}
          />
        ))}
      </div>
    </div>
  );
}

function PartView({
  part,
  showCaret,
  onDecide,
}: {
  part: ChatPart;
  showCaret: boolean;
  onDecide: (approvalId: string, approve: boolean) => void;
}) {
  if (part.kind === "text") {
    return (
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
        {part.text}
        {showCaret ? <span className="caret" aria-hidden="true" /> : null}
      </p>
    );
  }

  if (part.kind === "tool") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-line bg-paper-2/70 px-2 py-1 font-mono text-[12px]">
        <span aria-hidden="true">⚙</span>
        <span>{part.tool}</span>
        {part.risk ? <RiskChip risk={part.risk} /> : null}
        <span
          className={
            part.status === "running"
              ? "text-ink-60"
              : part.status === "ok"
                ? "text-moss"
                : "text-signal"
          }
        >
          {part.status === "running" ? "…" : part.status === "ok" ? "✓" : "✗"}{" "}
          {part.status !== "running" ? part.status : ""}
        </span>
      </span>
    );
  }

  // Inline approval card — amber, decidable without leaving the stream.
  return (
    <div className="slide-in max-w-md border border-amber bg-amber/5 p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-medium">{part.tool}</span>
        <span className="chip chip-outbound">approval required</span>
      </div>
      <pre className="mt-2 max-h-32 overflow-x-auto border border-line bg-paper p-2 font-mono text-[11px]">
        {prettyArgs(part.args)}
      </pre>
      {part.decided ? (
        <p
          className={`mt-2 font-mono text-[12px] ${
            part.decided === "approved" ? "text-moss" : "text-signal"
          }`}
        >
          {part.decided === "approved" ? "✓ approved" : "✗ denied"}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn btn-approve text-[12px]"
            onClick={() => onDecide(part.approvalId, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn-deny text-[12px]"
            onClick={() => onDecide(part.approvalId, false)}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
