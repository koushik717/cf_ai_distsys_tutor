export function getFrontendHTML(sessionId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DistSys AI Tutor</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      padding: 16px 24px;
      background: #1a1d27;
      border-bottom: 1px solid #2d3148;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #f48120, #faad3f);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    header h1 { font-size: 18px; font-weight: 600; color: #f1f5f9; }
    header p  { font-size: 12px; color: #94a3b8; margin-top: 2px; }

    .badge {
      margin-left: auto;
      font-size: 11px;
      background: #1e293b;
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 20px;
      color: #94a3b8;
    }

    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
    }

    .message {
      max-width: 75%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.6;
      font-size: 14px;
      white-space: pre-wrap;
    }

    .message.user {
      align-self: flex-end;
      background: #1d4ed8;
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .message.assistant {
      align-self: flex-start;
      background: #1e293b;
      border: 1px solid #2d3748;
      border-bottom-left-radius: 4px;
      color: #e2e8f0;
    }

    .message.system-msg {
      align-self: center;
      background: transparent;
      color: #64748b;
      font-size: 12px;
      border: none;
      padding: 4px;
    }

    .typing-indicator {
      align-self: flex-start;
      background: #1e293b;
      border: 1px solid #2d3748;
      border-radius: 12px;
      border-bottom-left-radius: 4px;
      padding: 12px 16px;
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .dot {
      width: 7px; height: 7px;
      background: #94a3b8;
      border-radius: 50%;
      animation: bounce 1.2s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    #input-area {
      padding: 16px 24px;
      background: #1a1d27;
      border-top: 1px solid #2d3148;
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }

    #user-input {
      flex: 1;
      background: #0f1117;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 16px;
      color: #e2e8f0;
      font-size: 14px;
      resize: none;
      min-height: 44px;
      max-height: 140px;
      outline: none;
      transition: border-color 0.2s;
      font-family: inherit;
    }
    #user-input:focus { border-color: #3b82f6; }
    #user-input::placeholder { color: #475569; }

    #send-btn {
      background: #2563eb;
      border: none;
      border-radius: 10px;
      width: 44px;
      height: 44px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #send-btn:hover:not(:disabled) { background: #1d4ed8; }
    #send-btn:disabled { background: #1e293b; cursor: not-allowed; }
    #send-btn svg { color: white; }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 24px 16px;
    }

    .suggestion-chip {
      font-size: 12px;
      padding: 6px 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.15s;
    }
    .suggestion-chip:hover {
      background: #2d3748;
      color: #e2e8f0;
      border-color: #4a5568;
    }

    code { background: #0f172a; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
    pre  { background: #0f172a; padding: 10px; border-radius: 8px; overflow-x: auto; margin: 6px 0; }
    pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <header>
    <div class="logo">&#x26A1;</div>
    <div>
      <h1>DistSys AI Tutor</h1>
      <p>Powered by Llama 3.3 on Cloudflare Workers AI</p>
    </div>
    <span class="badge">Session: ${sessionId.slice(0, 8)}...</span>
  </header>

  <div id="chat-container">
    <div class="message system-msg">Ask me anything about distributed systems, consensus algorithms, or system design.</div>
  </div>

  <div class="suggestions" id="suggestions">
    <span class="suggestion-chip" onclick="sendSuggestion(this)">Explain Raft consensus</span>
    <span class="suggestion-chip" onclick="sendSuggestion(this)">CAP theorem trade-offs</span>
    <span class="suggestion-chip" onclick="sendSuggestion(this)">Design a distributed KV store</span>
    <span class="suggestion-chip" onclick="sendSuggestion(this)">Consistent hashing explained</span>
    <span class="suggestion-chip" onclick="sendSuggestion(this)">Eventual vs strong consistency</span>
    <span class="suggestion-chip" onclick="sendSuggestion(this)">How does Redis pub/sub work?</span>
  </div>

  <div id="input-area">
    <textarea
      id="user-input"
      placeholder="Ask about distributed systems, consensus, system design..."
      rows="1"
    ></textarea>
    <button id="send-btn" onclick="sendMessage()">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>

  <script>
    const sessionId = "${sessionId}";
    const chatContainer = document.getElementById("chat-container");
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    const suggestions = document.getElementById("suggestions");

    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function appendMessage(role, content) {
      const div = document.createElement("div");
      div.className = "message " + role;
      div.textContent = content;
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return div;
    }

    function showTyping() {
      const div = document.createElement("div");
      div.className = "typing-indicator";
      div.id = "typing";
      div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function removeTyping() {
      const t = document.getElementById("typing");
      if (t) t.remove();
    }

    function sendSuggestion(chip) {
      input.value = chip.textContent;
      suggestions.style.display = "none";
      sendMessage();
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || sendBtn.disabled) return;

      suggestions.style.display = "none";
      appendMessage("user", text);
      input.value = "";
      input.style.height = "auto";
      sendBtn.disabled = true;
      showTyping();

      try {
        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId }),
        });

        removeTyping();

        if (!response.ok) {
          appendMessage("system-msg", "Error: " + response.statusText);
          return;
        }

        const msgDiv = appendMessage("assistant", "");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.response) {
                  msgDiv.textContent += data.response;
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        removeTyping();
        appendMessage("system-msg", "Connection error. Please try again.");
        console.error(err);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }
  </script>
</body>
</html>`;
}
