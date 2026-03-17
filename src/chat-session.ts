import { DurableObject } from "cloudflare:workers";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface SessionState {
  messages: Message[];
  summary: string | null;
  messageCount: number;
}

const SYSTEM_PROMPT = `You are an expert Distributed Systems tutor specializing in:
- Consensus algorithms (Raft, Paxos, PBFT)
- Consistency models (linearizability, eventual consistency, causal consistency)
- Distributed storage (consistent hashing, replication, sharding)
- Message queues and event-driven architecture
- CAP theorem, PACELC, and trade-offs
- System design patterns (circuit breakers, rate limiting, back-pressure)
- Observability: metrics, tracing, and alerting at scale

You give clear, concise explanations with real-world examples. When asked about system design,
you walk through trade-offs explicitly. You use analogies to make complex topics intuitive.
Keep answers focused and actionable. If a previous conversation summary is provided, use it
as context to maintain continuity.`;

export class ChatSession extends DurableObject {
  private storage: DurableObjectStorage;
  private env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = ctx.storage;
    this.env = env;
  }

  async getState(): Promise<SessionState> {
    const messages = (await this.storage.get<Message[]>("messages")) ?? [];
    const summary = (await this.storage.get<string>("summary")) ?? null;
    const messageCount = (await this.storage.get<number>("messageCount")) ?? 0;
    return { messages, summary, messageCount };
  }

  async chat(userMessage: string): Promise<ReadableStream<Uint8Array>> {
    const state = await this.getState();

    // Add user message to history
    const newUserMsg: Message = {
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    };
    state.messages.push(newUserMsg);
    state.messageCount++;

    // Build messages for LLM: system prompt + optional summary context + recent messages
    const llmMessages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (state.summary) {
      llmMessages.push({
        role: "system",
        content: `Previous conversation summary: ${state.summary}`,
      });
    }

    // Keep last 10 messages for context window efficiency
    const recentMessages = state.messages.slice(-10);
    for (const msg of recentMessages) {
      llmMessages.push({ role: msg.role, content: msg.content });
    }

    // Stream from Workers AI - Llama 3.3
    const stream = await (this.env.AI as any).run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: llmMessages,
        stream: true,
        max_tokens: 1024,
      }
    );

    // Collect full response to save to history
    const [streamForClient, streamForCapture] = stream.tee();

    // Async: capture response and persist state
    (async () => {
      let fullResponse = "";
      const reader = streamForCapture.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE data chunks
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.response) fullResponse += data.response;
              } catch {}
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Save assistant response
      if (fullResponse) {
        state.messages.push({
          role: "assistant",
          content: fullResponse,
          timestamp: Date.now(),
        });
      }

      await this.storage.put("messages", state.messages);
      await this.storage.put("messageCount", state.messageCount);

      // Trigger summarization workflow if conversation is getting long
      if (state.messages.length > 12) {
        try {
          await (this.env.SUMMARIZE_WORKFLOW as any).create({
            params: {
              sessionId: this.ctx.id.toString(),
              messages: state.messages.slice(0, -4), // summarize all but last 4
            },
          });
        } catch (e) {
          // Non-fatal: workflow trigger failure should not break chat
          console.error("Failed to trigger summarization workflow:", e);
        }
      }
    })();

    return streamForClient;
  }

  async setSummary(summary: string): Promise<void> {
    await this.storage.put("summary", summary);
    // Trim old messages, keep last 4 after summarization
    const state = await this.getState();
    const trimmed = state.messages.slice(-4);
    await this.storage.put("messages", trimmed);
  }

  async getHistory(): Promise<SessionState> {
    return this.getState();
  }

  async clearSession(): Promise<void> {
    await this.storage.deleteAll();
  }
}
