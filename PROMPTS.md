# PROMPTS.md

AI-assisted coding was used during development of this project. Below are the prompts
I wrote, along with the reasoning behind each architectural decision.

---

## Prompt 1 -- Architecture scoping

I had already decided on the core architecture before writing any code: Durable Objects
for session isolation (one DO per user, not a shared store), Workflows for the async
summarization step so it does not block the response stream, and SSE over WebSockets
because the interaction is unidirectional (server pushes tokens, client never sends
mid-stream). I used Claude to validate the wrangler.toml bindings and catch any
Cloudflare-specific gotchas early.

```
I am building a stateful AI chat app on Cloudflare Workers for a technical assignment.
Architecture I have decided on:
- Durable Objects for per-session memory: one DO instance per sessionId, SQLite storage
  for messages[], a summary string, and a messageCount
- Workers AI (Llama 3.3 70B fp8-fast) for streaming LLM responses via SSE
- Cloudflare Workflows for async conversation summarization triggered when message count
  exceeds a threshold -- I want this fully decoupled from the request path
- All served from a single Worker with clean routing (no Pages, no R2)

Give me a wrangler.toml that correctly binds AI, a Durable Object with SQLite migration
(new_sqlite_classes), and a named Workflow. Point out any binding or migration mistakes.
```

---

## Prompt 2 -- Durable Object: streaming + state persistence

The trickiest part here was the dual-consumer problem: I needed to stream tokens to the
client in real time while also capturing the full response to persist to storage. I knew
ReadableStream.tee() was the right primitive. I also intentionally kept only the last
10 messages in the LLM context window rather than the full history, so the prompt does
not grow unbounded before summarization kicks in.

```
Write a Durable Object class called ChatSession extending DurableObject.

Key requirements I have already decided on:
- chat(userMessage) must return a ReadableStream to the caller immediately (for SSE),
  while asynchronously capturing the full response to append to storage
- Use stream.tee() to split the Workers AI stream: one branch for the client, one for
  capture. The capture branch should parse SSE "data:" lines and accumulate response text
- Context window strategy: build LLM messages as [system prompt] + [summary if exists] +
  [last 10 messages]. This bounds prompt size before summarization runs
- Summarization trigger: after persisting the assistant response, if messages.length > 12
  trigger SUMMARIZE_WORKFLOW.create() -- wrap in try/catch so a workflow failure never
  breaks the chat response
- setSummary(summary) should also trim messages to last 4 (not last 10) so there is
  headroom before the next summarization trigger
- getHistory() and clearSession() as utility methods

Do not add retry logic inside the DO -- that belongs in the Workflow.
```

---

## Prompt 3 -- Workflow: async summarization with retries

I chose Workflows over a plain waitUntil() fetch because Workflows give me durable
execution with automatic retries and step-level state. If the LLM call fails partway
through, the Workflow retries just that step, not the whole thing. I specified
exponential backoff explicitly because a transient Workers AI overload should not cause
a thundering herd of immediate retries.

```
Write a Cloudflare Workflow class called SummarizeWorkflow that accepts:
  params: { sessionId: string, messages: { role, content, timestamp }[] }

Three steps:
1. "format-conversation": map messages to "ROLE: content" joined by double newline
2. "generate-summary": call Workers AI (Llama 3.3) to summarize in 3-5 sentences.
   Retries: limit 3, delay "5 seconds", backoff "exponential". The model should be
   told to be factual and specific -- no filler.
3. "store-summary": get the Durable Object via env.CHAT_SESSION.idFromString(sessionId)
   and call session.setSummary(summary) via RPC

Each step should be independent so partial failures retry only the failed step.
```

---

## Prompt 4 -- System prompt engineering

I wrote the topics list myself based on what I have actually built (Raft, consistent
hashing, Redis, message queues) and what I know engineers care about in system design
interviews. I asked Claude to shape it into a tight system prompt under 200 words.

```
Write a system prompt for a distributed systems AI tutor. I want it to cover exactly
these areas: Raft/Paxos/PBFT consensus, linearizability vs eventual vs causal
consistency, consistent hashing and replication, message queues and event-driven
architecture, CAP theorem and PACELC, circuit breakers and rate limiting, observability
(metrics, tracing, alerting).

Tone requirements: expert but approachable, always explains trade-offs explicitly,
uses real-world analogies, keeps answers focused and actionable. When a prior
conversation summary is available it should be used for continuity.
Keep the whole prompt under 200 words.
```

---

## Prompt 5 -- SSE streaming in the browser

I already knew the parsing approach: split on newlines, filter for "data: " prefix,
skip "[DONE]", JSON.parse the payload, append data.response tokens. I asked Claude
to wire this into a clean UI without a build step since the HTML is served inline from
the Worker. I specified the UX requirements (suggestion chips, typing indicator, auto-
resize textarea) to avoid back-and-forth.

```
Build a single-file dark-mode chat UI in vanilla HTML/JS (no frameworks, no build step,
served as a template string from a TypeScript file).

SSE parsing I want: fetch POST /chat, get response.body reader, decode chunks, split on
newlines, parse lines starting with "data: " (skip "[DONE]"), extract data.response,
append tokens to the current assistant message div in real time.

UX: suggestion chips for 6 common distributed systems questions that hide after first
use; typing indicator (3 bouncing dots) shown before first token arrives and removed
on first chunk; textarea auto-resizes up to 140px; Enter sends, Shift+Enter newlines.
Color scheme: bg #0f1117, user messages #1d4ed8, assistant cards #1e293b. No em dashes,
no special Unicode symbols anywhere in the UI copy.
```

---

## Manual changes made after AI generation

These are the decisions I made myself and applied by editing the generated code:

- **tee() async pattern**: The generated code initially tried to collect the full
  response before streaming. I rewrote the capture branch to run in a detached async
  IIFE so the client stream is returned immediately and the capture happens concurrently.

- **Workflow trigger safety**: Added a try/catch around SUMMARIZE_WORKFLOW.create()
  explicitly so a quota error or cold-start failure in the Workflow never propagates
  to the chat response.

- **Message trim threshold**: Changed post-summarization trim from "last 10" to "last 4"
  after reasoning that keeping 10 messages after summarization means the next trigger at
  message 12 leaves only 2 new messages before summarizing again -- not enough context.
  Last 4 gives 8 new messages of headroom.

- **Session routing**: Changed from idFromString(sessionId) to idFromName(sessionId)
  in the main Worker because the session ID comes from a URL param (a name), not a
  serialized DO ID string.

- **Redirect pattern**: Added a server-side redirect from / (no session param) to
  /?session=<uuid> so the session ID is in the URL and survives refreshes without
  needing localStorage.
