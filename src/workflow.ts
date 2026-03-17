import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";

export interface SummarizeParams {
  sessionId: string;
  messages: { role: string; content: string; timestamp: number }[];
}

export class SummarizeWorkflow extends WorkflowEntrypoint<Env, SummarizeParams> {
  async run(event: WorkflowEvent<SummarizeParams>, step: WorkflowStep) {
    const { sessionId, messages } = event.payload;

    // Step 1: Build conversation text for summarization
    const conversationText = await step.do("format-conversation", async () => {
      return messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");
    });

    // Step 2: Call LLM to generate summary (with automatic retry)
    const summary = await step.do(
      "generate-summary",
      { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" } },
      async () => {
        const response = await (this.env.AI as any).run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a concise summarizer. Summarize the following distributed systems tutoring conversation in 3-5 sentences, capturing the key topics covered, questions asked, and important concepts explained. Be factual and specific.",
              },
              {
                role: "user",
                content: `Summarize this conversation:\n\n${conversationText}`,
              },
            ],
            max_tokens: 256,
          }
        );
        return (response as any).response as string;
      }
    );

    // Step 3: Store summary back in the Durable Object
    await step.do("store-summary", async () => {
      const doId = this.env.CHAT_SESSION.idFromString(sessionId);
      const session = this.env.CHAT_SESSION.get(doId);
      await session.setSummary(summary);
    });
  }
}
