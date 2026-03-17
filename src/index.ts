import { ChatSession } from "./chat-session";
import { SummarizeWorkflow } from "./workflow";
import { getFrontendHTML } from "./frontend";

// Re-export Durable Object and Workflow classes (required by wrangler)
export { ChatSession, SummarizeWorkflow };

interface Env {
  AI: Ai;
  CHAT_SESSION: DurableObjectNamespace<ChatSession>;
  SUMMARIZE_WORKFLOW: Workflow;
}

function getOrCreateSessionId(request: Request): string {
  const url = new URL(request.url);
  const param = url.searchParams.get("session");
  if (param) return param;
  // Generate a stable random ID
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── GET / : serve chat UI ─────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/") {
      const sessionId = getOrCreateSessionId(request);
      // Redirect to include session in URL so refreshes keep the same session
      if (!url.searchParams.get("session")) {
        return Response.redirect(`${url.origin}/?session=${sessionId}`, 302);
      }
      return new Response(getFrontendHTML(sessionId), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ── POST /chat : stream LLM response ──────────────────────────────────
    if (request.method === "POST" && url.pathname === "/chat") {
      let body: { message: string; sessionId: string };
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const { message, sessionId } = body;
      if (!message || typeof message !== "string") {
        return new Response("Missing message", { status: 400 });
      }
      if (!sessionId || typeof sessionId !== "string") {
        return new Response("Missing sessionId", { status: 400 });
      }

      // Get or create the Durable Object for this session
      const doId = env.CHAT_SESSION.idFromName(sessionId);
      const session = env.CHAT_SESSION.get(doId);

      // Stream response from the DO
      const stream = await session.chat(message);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── GET /history : return conversation history ────────────────────────
    if (request.method === "GET" && url.pathname === "/history") {
      const sessionId = url.searchParams.get("session");
      if (!sessionId) {
        return new Response("Missing session param", { status: 400 });
      }
      const doId = env.CHAT_SESSION.idFromName(sessionId);
      const session = env.CHAT_SESSION.get(doId);
      const history = await session.getHistory();
      return new Response(JSON.stringify(history), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── DELETE /session : clear session ───────────────────────────────────
    if (request.method === "DELETE" && url.pathname === "/session") {
      const sessionId = url.searchParams.get("session");
      if (!sessionId) {
        return new Response("Missing session param", { status: 400 });
      }
      const doId = env.CHAT_SESSION.idFromName(sessionId);
      const session = env.CHAT_SESSION.get(doId);
      await session.clearSession();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
