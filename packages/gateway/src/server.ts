import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { z } from "zod";
import {
  ConfigSchema,
  createSession,
  deleteMemory,
  executeApprovedAction,
  getSession,
  listAudit,
  listMemories,
  listSessions,
  loadMessages,
  runAgentTurn,
  saveConfig,
  searchMemory,
  verifyToken,
  type AuditStatus,
  type Risk,
} from "@jarvis/core";
import type { GatewayDeps } from "./deps.js";
import { listJobs, upsertJob, deleteJob, JobSchema } from "./jobsStore.js";
import { listSkillRows, setSkillEnabled } from "./skillsStore.js";

function extractToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  const query = req.query as Record<string, unknown>;
  return typeof query?.token === "string" ? query.token : "";
}

const ChatBody = z.object({
  message: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});

const DecideBody = z.object({ approve: z.boolean() });

/**
 * REST + websocket API. Every route except /health requires the bearer token
 * from `jarvis token` (Authorization header, or ?token= for websockets).
 */
export function buildServer(deps: GatewayDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  // The dashboard is always cross-origin (another port locally, Vercel when
  // deployed), so reflect the caller's origin; the bearer token — required on
  // every route — remains the actual access control.
  void app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE"] });
  void app.register(websocket);

  app.addHook("onRequest", (req, reply, done) => {
    if (req.method === "OPTIONS") return done(); // CORS preflight carries no auth header
    if (req.url === "/health") return done();
    if (!verifyToken(extractToken(req))) {
      void reply.code(401).send({ success: false, error: "Invalid or missing bearer token" });
      return;
    }
    done();
  });

  app.get("/health", async () => ({ ok: true }));

  // ---- chat (REST, non-streaming; ws below streams) ----
  app.post("/chat", async (req) => {
    const body = ChatBody.parse(req.body);
    const sessionId =
      body.sessionId && getSession(deps.db, body.sessionId)
        ? body.sessionId
        : createSession(deps.db, "ws").id;
    const reply = await runAgentTurn({
      db: deps.db,
      config: deps.config,
      tools: deps.tools,
      streamFn: deps.streamFn,
      broker: deps.broker,
      source: "ws",
      sessionId,
      userText: body.message,
      skillInstructions: deps.skillInstructions(),
    });
    return { success: true, data: { sessionId, reply } };
  });

  app.get("/sessions", async () => ({ success: true, data: listSessions(deps.db, 20) }));

  app.get("/sessions/:id/messages", async (req) => {
    const { id } = req.params as { id: string };
    return { success: true, data: loadMessages(deps.db, id) };
  });

  // ---- approvals ----
  app.get("/approvals", async (req) => {
    const { status } = req.query as { status?: string };
    const rows = status === "pending" ? deps.broker.listPending() : deps.broker.list(100);
    return { success: true, data: rows };
  });

  app.post("/approvals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = DecideBody.parse(req.body);
    const row = deps.broker.get(id);
    if (!row) return reply.code(404).send({ success: false, error: "Approval not found" });
    if (row.status !== "pending") {
      return reply.code(409).send({ success: false, error: `Already ${row.status}` });
    }
    // Snapshot BEFORE decide — decide() resumes a live waiter synchronously.
    const hadWaiter = deps.broker.hasWaiter(id);
    deps.broker.decide(id, body.approve);
    let replay;
    if (body.approve && !hadWaiter) {
      replay = await executeApprovedAction({
        db: deps.db,
        config: deps.config,
        tools: deps.tools,
        broker: deps.broker,
        source: "gateway",
        approvalId: id,
      });
    }
    return { success: true, data: { approval: deps.broker.get(id), replay } };
  });

  // ---- memories ----
  app.get("/memories", async (req) => {
    const { query, limit } = req.query as { query?: string; limit?: string };
    const max = Math.min(Number(limit ?? 100) || 100, 500);
    const rows = query ? searchMemory(deps.db, query, max) : listMemories(deps.db, max);
    return { success: true, data: rows };
  });

  app.delete("/memories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = deleteMemory(deps.db, Number(id));
    if (!ok) return reply.code(404).send({ success: false, error: "Memory not found" });
    return { success: true, data: { deleted: Number(id) } };
  });

  // ---- audit ----
  app.get("/audit", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const rows = listAudit(deps.db, {
      tool: q.tool,
      risk: q.risk as Risk | undefined,
      status: q.status as AuditStatus | undefined,
      source: q.source,
      limit: Math.min(Number(q.limit ?? 100) || 100, 500),
      offset: Number(q.offset ?? 0) || 0,
    });
    return { success: true, data: rows };
  });

  // ---- jobs ----
  app.get("/jobs", async () => ({ success: true, data: listJobs(deps.db) }));

  app.put("/jobs/:id", async (req) => {
    const { id } = req.params as { id: string };
    const job = JobSchema.parse({ ...(req.body as object), id });
    upsertJob(deps.db, job);
    deps.events.emit("jobs-changed");
    return { success: true, data: job };
  });

  app.delete("/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteJob(deps.db, id)) {
      return reply.code(404).send({ success: false, error: "Job not found" });
    }
    deps.events.emit("jobs-changed");
    return { success: true, data: { deleted: id } };
  });

  // ---- skills (rows exist Phase 1; loader arrives Phase 4) ----
  app.get("/skills", async () => ({ success: true, data: listSkillRows(deps.db) }));

  app.post("/skills/reload", async (req, reply) => {
    if (!deps.skillsRuntime) {
      return reply.code(501).send({ success: false, error: "Skill runtime not attached" });
    }
    return { success: true, data: deps.skillsRuntime.reload() };
  });

  app.post("/skills/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    if (!setSkillEnabled(deps.db, id, body.enabled)) {
      return reply.code(404).send({ success: false, error: "Skill not found" });
    }
    deps.events.emit("skills-changed");
    return { success: true, data: { id, enabled: body.enabled } };
  });

  // ---- config ----
  app.get("/config", async () => ({ success: true, data: deps.config }));

  app.put("/config", async (req) => {
    const merged = ConfigSchema.parse({ ...deps.config, ...(req.body as object) });
    saveConfig(merged);
    Object.assign(deps.config, merged);
    deps.events.emit("config-changed");
    return { success: true, data: merged };
  });

  // ---- websocket: streaming chat + live events ----
  const sockets = new Set<WebSocket>();
  const broadcast = (payload: unknown): void => {
    const text = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(text);
    }
  };
  deps.events.on("broadcast", broadcast);
  deps.broker.on("pending", (row) => deps.events.emit("broadcast", { type: "approval-pending", approval: row }));
  deps.broker.on("decided", (row) => deps.events.emit("broadcast", { type: "approval-decided", approval: row }));

  app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, (socket: WebSocket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("message", (raw: Buffer) => {
        void handleWsMessage(socket, raw);
      });
    });
  });

  async function handleWsMessage(socket: WebSocket, raw: Buffer): Promise<void> {
    const send = (payload: unknown): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return send({ type: "error", error: "Invalid JSON" });
    }
    const message = z
      .object({ type: z.literal("chat"), message: z.string().min(1), sessionId: z.string().optional() })
      .safeParse(parsed);
    if (!message.success) return send({ type: "error", error: "Unsupported message" });

    const sessionId =
      message.data.sessionId && getSession(deps.db, message.data.sessionId)
        ? message.data.sessionId
        : createSession(deps.db, "ws").id;
    send({ type: "session", sessionId });
    try {
      const reply = await runAgentTurn({
        db: deps.db,
        config: deps.config,
        tools: deps.tools,
        streamFn: deps.streamFn,
        broker: deps.broker,
        source: "ws",
        sessionId,
        userText: message.data.message,
        skillInstructions: deps.skillInstructions(),
        onEvent: (event) => send(event),
      });
      send({ type: "turn-complete", sessionId, reply });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return app;
}
