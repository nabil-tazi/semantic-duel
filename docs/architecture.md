# Architecture

## Components

```
┌──────────────┐       HTTP (REST)        ┌─────────────────────────┐
│              │ ───── create/join ─────▶ │   Fastify HTTP server   │
│   Browser    │                          │                         │
│  (React +    │       WebSocket          │   Socket.IO server      │
│  Socket.IO   │ ◀──── (Socket.IO) ─────▶ │   ├─ room registry      │
│   client)    │                          │   ├─ session store      │
│              │                          │   └─ round timers       │
└──────────────┘                          │                         │
                                          │   ┌─────────────────┐   │
                                          │   │  LLM pipeline   │   │
                                          │   │  (OpenRouter)   │   │
                                          │   └─────────────────┘   │
                                          └─────────────────────────┘
```

One Node process hosts both the Fastify HTTP server and the Socket.IO server (Socket.IO attaches to the Fastify HTTP server). Session state is a `Map` in memory.

## Runtime flow (one match)

1. **Room creation** — `POST /rooms` returns a new 6-char room code. Server creates an empty `Session` in the store.
2. **Join** — client opens a Socket.IO connection, emits `room:join { code, displayName }`. Server adds a `Player` to the session, broadcasts `room:state` to everyone in the room.
3. **Host starts** — the host client emits `match:start`. Server validates (≥2 players), transitions session state to `in_round`, and kicks off round 1.
4. **Round start** — server calls the LLM to generate a theme, writes it to the `Round`, records `startedAt`, broadcasts `round:start { theme, deadline }`, and starts a 15s timer.
5. **Submission** — each player emits `round:submit { word }`. The server records it to the round's `submissions` map. If a player already submitted for this round, the second submission is ignored (idempotent).
6. **Round close** — triggered by either (a) all players submitted, or (b) timer expired. Server calls the LLM adjudicator with all words and the theme; receives `{ winnerId, reasoning }`. Scores are updated. Server broadcasts `round:reveal { submissions, winnerId, reasoning, scores }`.
7. **Next round or end** — after a short delay (e.g. 5s for reading), repeat for 5 rounds. After round 5, server broadcasts `match:summary { finalScores, winnerId }` and transitions session state to `finished`.

## Session state machine

```
lobby ──match:start──▶ in_round ──round closes──▶ reveal ──delay──▶ in_round (next)
                                                     │
                                                     └─(after round 5)─▶ finished
```

Any player disconnecting mid-match is kept in the session (they may reconnect). If everyone disconnects, the session is garbage-collected after an idle timeout (e.g. 10 minutes).

## Why server-authoritative?

All state transitions and all timing live on the server:
- Clients cannot forge a submission after the deadline.
- The LLM adjudication runs once per round, on the server, not per client.
- Reveal is simultaneous by construction: the server broadcasts to the room in a single emit.

Clients render what the server tells them. No optimistic updates for round outcomes.

## Timing

- The server holds the authoritative round deadline as a `Date`.
- `round:start` carries `deadline` as an ISO string so clients can render a countdown.
- When the server's 15s timer fires (or all players have submitted), the server calls the LLM. Any client-side countdown reaching zero is visual only.

## Failure modes

| Failure | Handling |
|---|---|
| LLM call times out / errors on theme | Retry once, then fall back to a hardcoded theme pool |
| LLM call times out / errors on winner | Retry once, then fall back to deterministic rule (e.g. alphabetically first) and flag reasoning as "fallback" |
| Client disconnects mid-round | Their slot remains; if they reconnect, server replays current state via `room:state` |
| All clients disconnect | Session kept for 10 min, then evicted |
| Server restart | Match is lost (acceptable for local) |

## Directory layout

```
game-exercise/
├── package.json               # workspaces root
├── .env.example
├── shared/
│   └── src/
│       ├── types.ts           # Session, Round, Player, events
│       └── events.ts          # Socket.IO event name constants
├── server/
│   ├── package.json
│   └── src/
│       ├── index.ts           # Fastify + Socket.IO bootstrap
│       ├── sessionStore.ts    # Map<sessionId, Session>, CRUD
│       ├── roomHandlers.ts    # Socket.IO event handlers
│       ├── matchEngine.ts     # round lifecycle, timers, scoring
│       └── llm/
│           ├── client.ts      # OpenRouter client
│           ├── theme.ts       # theme generation prompt
│           └── adjudicate.ts  # winner selection prompt
└── client/
    ├── package.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── socket.ts          # Socket.IO client singleton
        ├── screens/
        │   ├── Home.tsx       # create/join room
        │   ├── Lobby.tsx
        │   ├── Round.tsx      # theme + submission
        │   ├── Reveal.tsx     # words + winner + reasoning
        │   └── Summary.tsx
        └── state/
            └── session.ts     # client-side session state store
```
