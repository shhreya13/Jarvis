import { RiskChip } from "./chips";
import type { Risk } from "@/lib/types";

/** Static, informational: the 12 built-in tools and their risk classes. */
const BUILT_INS: Array<{ tool: string; risk: Risk; note?: string }> = [
  { tool: "read_file", risk: "read" },
  { tool: "list_files", risk: "read" },
  { tool: "web_search", risk: "read" },
  { tool: "search_memory", risk: "read" },
  { tool: "gmail_search", risk: "read" },
  { tool: "calendar_read", risk: "read" },
  { tool: "write_file", risk: "write" },
  { tool: "remember", risk: "write" },
  { tool: "gmail_create_draft", risk: "outbound" },
  { tool: "webhook_post", risk: "outbound" },
  { tool: "shell_exec", risk: "exec" },
  { tool: "http_request", risk: "read", note: "read for GET, outbound for other methods" },
];

export function ToolMatrix() {
  return (
    <div>
      <div className="overflow-x-auto border border-line">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Risk</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {BUILT_INS.map((entry) => (
              <tr key={entry.tool}>
                <td>{entry.tool}</td>
                <td>
                  <RiskChip risk={entry.risk} />
                </td>
                <td className="text-ink-60">{entry.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-60">
        read/write actions auto-run; outbound/exec actions always require approval.
      </p>
    </div>
  );
}
