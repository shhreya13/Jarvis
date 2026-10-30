export * from "./schema.js";
export * from "./files.js";
export * from "./shell.js";
export * from "./http.js";
export * from "./webSearch.js";
export * from "./memoryTools.js";
export * from "./google.js";
export * from "./gmail.js";
export * from "./calendar.js";
export * from "./webhook.js";

import type { AnyTool } from "@jarvis/core";
import { listFilesTool, readFileTool, writeFileTool } from "./files.js";
import { shellExecTool } from "./shell.js";
import { httpRequestTool } from "./http.js";
import { webSearchTool } from "./webSearch.js";
import { rememberTool, searchMemoryTool } from "./memoryTools.js";
import { gmailCreateDraftTool, gmailSearchTool } from "./gmail.js";
import { calendarReadTool } from "./calendar.js";
import { webhookPostTool } from "./webhook.js";

/**
 * All 12 built-in Jarvis tools, ordered roughly by how often the model should
 * reach for them: workspace files first, then execution and the network, then
 * memory, then the Google integrations and webhooks.
 */
export function buildBuiltinTools(): AnyTool[] {
  return [
    readFileTool,
    writeFileTool,
    listFilesTool,
    shellExecTool,
    httpRequestTool,
    webSearchTool,
    rememberTool,
    searchMemoryTool,
    gmailSearchTool,
    gmailCreateDraftTool,
    calendarReadTool,
    webhookPostTool,
  ];
}
