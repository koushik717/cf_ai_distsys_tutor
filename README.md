# cf_ai_distsys_tutor

**Live demo:** https://cf-ai-distsys-tutor.venkatakoushik777.workers.dev

An AI-powered Distributed Systems tutor built on Cloudflare. Chat with Llama 3.3 about
consensus algorithms, consistency models, system design, and distributed architecture.
Each conversation is stateful and persistent -- your session survives page refreshes and
returns, with automatic summarization of long conversations.

Built as an optional assignment for the Cloudflare Software Engineer Intern (Summer 2026)
application by Venkata Koushik Nakka.

---

## Architecture

### Components

| Component | Cloudflare Primitive | Purpose |
|---|---|---|
| LLM | Workers AI (Llama 3.3 70B) | Streaming AI responses |
| Memory / State | Durable Objects (SQLite) | Per-session conversation history |
| Workflow | Cloudflare Workflows | Async summarization of long conversations |
| Serving | Cloudflare Workers | HTTP routing + SSE streaming |
| UI | HTML/JS served from Worker | Chat interface |

### How it works

1. User visits `/` and gets assigned a session ID (UUID stored in URL param).
2. Each chat message goes to `POST /chat` with the session ID.
3. The Worker routes the request to a **Durable Object** (`ChatSession`) identified by
   the session ID. The DO holds the full conversation history in its built-in SQLite storage.
4. The DO builds a prompt (system prompt + optional summary context + last 10 messages)
   and streams a response from **Workers AI** (Llama 3.3 70B) via SSE.
5. The response is streamed to the browser in real time while simultaneously being
   captured and saved back to the DO's storage.
6. When the conversation exceeds 12 messages, the DO triggers a **Cloudflare Workflow**
   (`SummarizeWorkflow`) asynchronously. The workflow summarizes older messages using
   the LLM (with automatic retries), stores the summary back in the DO, and trims the
   message list -- keeping context manageable without losing continuity.

```
Browser
  |
  | GET /  (serve UI)
  | POST /chat (user message + sessionId)
  v
Cloudflare Worker (index.ts)
  |
  | idFromName(sessionId)
  v
Durable Object: ChatSession
  |-- SQLite: messages[], summary, messageCount
  |
  | AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { stream: true })
  v
Workers AI  <-- streams SSE back to browser
  |
  | (async, when messages > 12)
  v
Cloudflare Workflow: SummarizeWorkflow
  |-- Step 1: format conversation text
  |-- Step 2: LLM summarization (auto-retry up to 3x)
  |-- Step 3: store summary in Durable Object, trim messages
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI

### Setup

```bash
git clone https://github.com/koushik717/cf_ai_distsys_tutor
cd cf_ai_distsys_tutor
npm install
```

### Run locally

```bash
npm run dev
```

Open http://localhost:8787 in your browser. Wrangler's local dev mode provides:
- A local Workers AI simulation (or proxies to Cloudflare if you are logged in)
- Local Durable Objects backed by in-memory SQLite
- Local Workflow execution

### Deploy to Cloudflare

```bash
# Authenticate with Cloudflare
npx wrangler login

# Deploy
npm run deploy
```

After deployment, Wrangler will output your Worker URL
(e.g. `https://cf-ai-distsys-tutor.your-subdomain.workers.dev`).

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Serve the chat UI (creates/reuses session) |
| POST | `/chat` | Send a message, streams SSE response |
| GET | `/history?session=<id>` | Fetch raw conversation history JSON |
| DELETE | `/session?session=<id>` | Clear session data |

### POST /chat

Request body:
```json
{
  "message": "Explain Raft leader election",
  "sessionId": "your-session-uuid"
}
```

Response: `text/event-stream` (SSE), each chunk is:
```
data: {"response": "token..."}
```

---

## Example Conversations

- "Explain Raft consensus from scratch"
- "What are the trade-offs between Paxos and Raft?"
- "Design a distributed rate limiter"
- "How does consistent hashing work and why is it used?"
- "What is the difference between linearizability and sequential consistency?"
- "Walk me through how Redis Cluster handles failover"

---

## Project Structure

```
cf_ai_distsys_tutor/
  src/
    index.ts          -- Worker entry point + HTTP routing
    chat-session.ts   -- Durable Object: session memory + AI streaming
    workflow.ts       -- Cloudflare Workflow: async summarization
    frontend.ts       -- HTML/JS chat UI (served from Worker)
  wrangler.toml       -- Cloudflare config (AI, DO, Workflow bindings)
  package.json
  tsconfig.json
  README.md
  PROMPTS.md          -- AI prompts used during development
```

---

## Author

Venkata Koushik Nakka
- GitHub: [koushik717](https://github.com/koushik717)
- LinkedIn: [venkata-koushik-nakka](https://www.linkedin.com/in/venkata-koushik-nakka-532b80217/)
- Email: venkatakoushik777@gmail.com
