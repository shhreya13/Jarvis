import { streamText, tool as aiTool, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import type { z } from "zod";
import type { AnyTool } from "./toolTypes.js";

export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; call: ToolCallRequest }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: unknown };

export interface ModelTurnRequest {
  system: string;
  messages: ModelMessage[];
  tools: AnyTool[];
}

/**
 * One single-step model call, streamed. The agent loop owns multi-step tool
 * execution so the approval gate can pause it indefinitely (see DECISIONS D-7).
 */
export type ModelStreamFn = (req: ModelTurnRequest) => AsyncIterable<StreamEvent>;

export function aiSdkStream(model: LanguageModel): ModelStreamFn {
  return async function* modelStream(req) {
    const toolSet: ToolSet = Object.fromEntries(
      req.tools.map((t) => [
        t.name,
        aiTool({
          description: t.description,
          inputSchema: t.schema as z.ZodType<unknown>,
        }),
      ]),
    );

    const result = streamText({
      model,
      system: req.system,
      messages: req.messages,
      tools: toolSet,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          yield { type: "text-delta", text: part.text };
          break;
        case "tool-call":
          yield {
            type: "tool-call",
            call: { toolCallId: part.toolCallId, toolName: part.toolName, input: part.input },
          };
          break;
        case "finish":
          yield { type: "finish", finishReason: String(part.finishReason) };
          break;
        case "error":
          yield { type: "error", error: part.error };
          break;
        default:
          break;
      }
    }
  };
}
