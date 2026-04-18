# Realtime protocol

All realtime communication is over Socket.IO. Each session maps to a Socket.IO room named by the session `id` (the room code).

## Transport

- Socket.IO v4, default transports (websocket with polling fallback).
- One Socket.IO connection per browser tab.
- Socket connection is authenticated by a `playerId` handshake `auth` field after the player has joined via REST.

## REST endpoints (pre-socket)

REST is used only for the two actions where the player does not yet have a socket in a room:

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/rooms` | `{ displayName }` | `{ roomCode, playerId, hostId }` |
| `POST` | `/rooms/:code/join` | `{ displayName }` | `{ roomCode, playerId }` or `409` if full / match in progress |

After either call, the client opens a Socket.IO connection with `auth: { playerId, roomCode }` and receives the current `room:state`.

## Socket events

Naming convention: `<domain>:<action>`. Client-originated events are verbs; server-originated events are state/past-tense.

### Client → Server

| Event | Payload | When |
|---|---|---|
| `room:join` | `{}` (playerId comes from auth) | Immediately after socket connect; idempotent |
| `room:leave` | `{}` | Player explicitly leaves |
| `match:start` | `{}` | Host only; starts round 1 |
| `round:submit` | `{ word: string }` | During `in_round` status; server ignores if already submitted or past deadline |

### Server → Client (broadcast to room)

| Event | Payload | When |
|---|---|---|
| `room:state` | Full `Session` (serialized) | On join, on any state change that doesn't have a more specific event |
| `room:player_joined` | `{ player: Player }` | Another player joins |
| `room:player_left` | `{ playerId: string }` | Another player leaves or disconnects |
| `round:start` | `{ roundIndex, theme, deadline }` | Round begins |
| `round:progress` | `{ submittedPlayerIds: string[] }` | After each submission (lets UI show "3/5 submitted") without revealing *which* word anyone picked |
| `round:reveal` | `{ roundIndex, submissions, winnerId, reasoning, scores, adjudicationSource }` | Round ends |
| `match:summary` | `MatchSummary` | After the final round's reveal delay |
| `error` | `{ code, message }` | Validation / protocol errors |

### Key design choices

- **`round:progress` hides words**: it only sends `submittedPlayerIds`. Words must stay secret until the simultaneous reveal. If we sent the word itself, a client could inspect network traffic and see opponents' picks early.
- **`round:reveal` is a single broadcast**: "revealed simultaneously to every player" is enforced by the server emitting once to the room. There's no per-client animation staggering on the server side.
- **No per-player targeted events during a round**: everything relevant is broadcast to the room. The only per-socket payload is the initial `room:state` on reconnect.
- **Reconnection**: if a client reconnects, it sends `room:join` again; the server re-sends `room:state` with current phase (including current round's `theme` and `deadline` if mid-round, but **not** other players' submitted words).

## Error codes

| Code | Meaning |
|---|---|
| `ROOM_NOT_FOUND` | Room code doesn't exist |
| `ROOM_FULL` | 20 players already |
| `MATCH_IN_PROGRESS` | Can't join once the match has started |
| `NOT_HOST` | Non-host tried to call `match:start` |
| `TOO_FEW_PLAYERS` | `match:start` with < 2 players |
| `ALREADY_SUBMITTED` | Second `round:submit` from same player for same round |
| `SUBMISSION_CLOSED` | Submission after deadline |
| `INVALID_WORD` | Empty or > 40 chars after trim |

## Timing and clock skew

The server sends `deadline` as an ISO timestamp. Clients compute remaining time as `deadline - now()` using their local clock. Small skew is fine for a countdown UI. The server is the only authority on whether a submission is in-time — clients cannot submit past the server's deadline regardless of what their local clock shows.
