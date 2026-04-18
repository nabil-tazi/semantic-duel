# Tech stack

## Choices

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One source of truth for `Session`/`Round`/`Player` types shared between client and server |
| Frontend | React + Vite | Fast dev loop, already comfortable; Vite over CRA for speed |
| Backend runtime | Node.js | Same language as frontend, first-class Socket.IO support |
| HTTP server | Fastify | Better TS ergonomics than Express, faster; needed for a couple of REST endpoints (create/join room) |
| Realtime transport | Socket.IO | Built-in room semantics map 1:1 to our session model; auto-reconnect; broadcast-to-room primitives |
| LLM provider | OpenRouter | User preference; lets us swap models without changing code |
| LLM SDK | OpenAI SDK pointed at OpenRouter's `/v1` | OpenRouter is OpenAI-compatible; avoids a bespoke HTTP client |
| State | In-memory `Map<sessionId, Session>` | Single-process, local-only app; no persistence requirement; lose-on-restart is acceptable |
| Package layout | npm workspaces monorepo (`server/`, `client/`, `shared/`) | Share types via `shared/` without a publish step |
| Env/secrets | `.env` + `dotenv` on server only | API key must never leak to the browser |

## Explicitly rejected

- **Native `ws`**: would require rebuilding rooms, reconnection, and a message-routing layer. Not worth it for this exercise.
- **Express**: works fine, but Fastify's type inference is better and we want typed request/response shapes.
- **A database (Postgres/SQLite/Redis)**: the game is ephemeral. A match lasts ~2 minutes. Persistence adds no value for a local exercise.
- **Next.js or a full framework**: the client is a few screens (lobby / round / reveal / summary). A framework adds overhead we don't need.
- **Anthropic/OpenAI SDKs directly**: user picked OpenRouter. We point the OpenAI SDK at OpenRouter's base URL — one code path, many models.

## Tradeoffs we're accepting

- **No persistence**: if the server restarts mid-match, the match is lost. Fine for local; would be the first thing to change for production.
- **Single process**: one Node process owns all session state. No horizontal scaling. Fine for up to 20 players × however many rooms one box can hold in memory (effectively unlimited at this scale).
- **Socket.IO over raw WS**: slightly larger payload and a tiny protocol overhead in exchange for rooms, reconnection, and ack callbacks we'd otherwise build ourselves.
