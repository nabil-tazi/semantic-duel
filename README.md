# Semantic Duel

A local multiplayer word game. N players (up to 20) join a room, are given a theme each round, submit a word privately within 15 seconds, and an LLM adjudicates which word "dominates" the others rock-paper-scissors style. 5 rounds per match.

## Structure

- `server/` — Node.js + TypeScript game server (Fastify + Socket.IO)
- `client/` — React + TypeScript web UI
- `shared/` — types shared between client and server
- `docs/` — design docs

## Docs

- [Tech stack](docs/tech-stack.md) — what we chose and why
- [Architecture](docs/architecture.md) — components and runtime shape
- [Data model](docs/data-model.md) — Session / Round / Player
- [Realtime protocol](docs/realtime-protocol.md) — Socket.IO event contract
- [LLM pipeline](docs/llm-pipeline.md) — theme generation + winner adjudication

## Running locally

1. Fill in `OPENROUTER_API_KEY`.
2. `npm install` at the root (monorepo workspaces).
3. `npm run dev` — starts server on `:3001` and Vite dev server on `:5173`.

## Configuration

Secrets live in `.env` at the repo root. **Never commit the real `.env`.** `.env.example` is the template.
