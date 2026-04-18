// Wire-format types. Shared between client and server.
// Dates are ISO 8601 strings. Maps are Record<string, ...> keyed by playerId.

export type SessionStatus = 'lobby' | 'in_round' | 'reveal' | 'finished';

export type AdjudicationSource = 'llm' | 'fallback';

export interface Player {
  id: string;
  displayName: string;
  score: number;
  connected: boolean;
  joinedAt: string;
}

export interface Submission {
  playerId: string;
  word: string;
  submittedAt: string;
}

export interface Round {
  id: string;
  index: number;
  theme: string | null;
  startedAt: string | null;
  deadline: string | null;
  submissions: Record<string, Submission>;
  revealedAt: string | null;
  winnerId: string | null;
  reasoning: string | null;
  adjudicationSource: AdjudicationSource | null;
}

export interface Session {
  id: string;
  hostId: string;
  status: SessionStatus;
  players: Record<string, Player>;
  rounds: Round[];
  currentRoundIndex: number;
  totalRounds: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface MatchSummary {
  sessionId: string;
  finalScores: Array<{ playerId: string; displayName: string; score: number }>;
  winnerId: string | null;
  rounds: Array<{
    index: number;
    theme: string;
    winnerId: string | null;
    reasoning: string;
    submissions: Array<{ playerId: string; word: string }>;
  }>;
}

// REST payloads

export interface CreateRoomRequest {
  displayName: string;
}
export interface CreateRoomResponse {
  roomCode: string;
  playerId: string;
}

export interface JoinRoomRequest {
  displayName: string;
}
export interface JoinRoomResponse {
  roomCode: string;
  playerId: string;
}

// Socket event payloads

export interface RoundStartPayload {
  roundIndex: number;
  theme: string;
  deadline: string;
}

export interface RoundProgressPayload {
  roundIndex: number;
  submittedPlayerIds: string[];
}

export interface RoundRevealPayload {
  roundIndex: number;
  submissions: Record<string, Submission>;
  winnerId: string | null;
  reasoning: string;
  adjudicationSource: AdjudicationSource;
  scores: Record<string, number>;
}

export interface RoomPlayerJoinedPayload {
  player: Player;
}

export interface RoomPlayerLeftPayload {
  playerId: string;
}

export interface RoomClosedPayload {
  reason: 'host_closed';
}

export interface RoundSubmitPayload {
  word: string;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'NOT_HOST'
  | 'TOO_FEW_PLAYERS'
  | 'ALREADY_SUBMITTED'
  | 'SUBMISSION_CLOSED'
  | 'INVALID_WORD'
  | 'INVALID_NAME'
  | 'UNAUTHORIZED';
