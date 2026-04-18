# Data model

These are server-authoritative shapes. `shared/src/types.ts` exports them so the client uses the same definitions.

## Session

The top-level game object. One per room.

```ts
type SessionStatus = 'lobby' | 'in_round' | 'reveal' | 'finished';

interface Session {
  id: string;                      // room code, 6 chars, uppercase alphanumeric
  hostId: string;                  // playerId of the host
  status: SessionStatus;
  players: Map<string, Player>;    // keyed by playerId; max 20
  rounds: Round[];                 // scheduled rounds, length = totalRounds
  currentRoundIndex: number;       // -1 before match starts
  totalRounds: number;             // 5
  createdAt: Date;
  lastActivityAt: Date;            // for idle GC
}
```

### Invariants

- `players.size` ≤ 20.
- `rounds.length === totalRounds` once the match starts; rounds are allocated up-front so the shape matches "Scheduled rounds".
- `currentRoundIndex` is `-1` in `lobby`, `0..totalRounds-1` while playing, and `totalRounds-1` in `finished`.
- `status === 'in_round'` ⟺ the current round has `startedAt` set and `revealedAt` unset.

## Player

```ts
interface Player {
  id: string;                      // uuid
  displayName: string;             // 1–20 chars, trimmed
  score: number;                   // starts at 0, increments by 1 per round win
  connected: boolean;              // false while disconnected; kept in session for reconnect
  joinedAt: Date;
}
```

## Round

```ts
interface Round {
  id: string;                                  // uuid
  index: number;                               // 0-based position within the match
  theme: string | null;                        // null until round starts
  startedAt: Date | null;                      // null until round starts
  deadline: Date | null;                       // startedAt + 15s
  submissions: Map<string, Submission>;        // keyed by playerId
  revealedAt: Date | null;                     // null until reveal
  winnerId: string | null;                     // null until adjudicated
  reasoning: string | null;                    // null until adjudicated
  adjudicationSource: 'llm' | 'fallback' | null;
}

interface Submission {
  playerId: string;
  word: string;                                // trimmed, max 40 chars
  submittedAt: Date;
}
```

### Invariants

- Once `submissions.has(playerId)` is true, further submissions for that round from that player are **ignored**. This encodes the "once a word is received from a user, we're not listening anymore" rule.
- `revealedAt` is set exactly once, at round close.
- `winnerId` must be a key in `submissions` (no winner picked from players who didn't submit).
- Players who didn't submit by the deadline are simply absent from `submissions` — they cannot win that round.

## Match summary

Computed at match end (not stored separately — derivable from `Session`):

```ts
interface MatchSummary {
  sessionId: string;
  finalScores: Array<{ playerId: string; displayName: string; score: number }>;
  winnerId: string | null;         // null if tie
  rounds: Array<{
    index: number;
    theme: string;
    winnerId: string | null;
    reasoning: string;
    submissions: Array<{ playerId: string; word: string }>;
  }>;
}
```

## Wire format note

`Map` and `Date` are used in the in-memory model for ergonomics. On the wire (Socket.IO payloads), they are serialized:

- `Map<K, V>` → `Record<K, V>` or `Array<{ key, value }>` depending on shape. Player and submission maps serialize as records keyed by playerId.
- `Date` → ISO 8601 string.

A small `serialize()` helper at the boundary keeps the in-memory model clean.

## Why up-front round allocation?

The design note says "Scheduled rounds, with the theme". We allocate all 5 `Round` objects when the match starts, with `theme: null`. Themes are filled in one-by-one as each round starts. This matches the phrasing, keeps `rounds.length` stable, and makes `currentRoundIndex` a simple integer into a fixed-length array.
