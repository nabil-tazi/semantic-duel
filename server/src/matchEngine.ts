import type { Server as IoServer } from 'socket.io';
import {
  MAX_WORD_LENGTH,
  MIN_PLAYERS,
  REVEAL_DELAY_MS,
  ROUND_DURATION_MS,
  ServerEvent,
  type MatchSummary,
  type Round,
  type RoundProgressPayload,
  type RoundRevealPayload,
  type RoundStartPayload,
  type Session,
} from '@semantic-duel/shared';
import { adjudicate } from './llm/adjudicate.js';
import { generateTheme } from './llm/theme.js';
import { allocateRounds, playerCount, touchSession } from './sessionStore.js';

// Side-state: timers keyed by session id. Not part of wire-format Session.
const roundTimers = new Map<string, NodeJS.Timeout>();
const closingRounds = new Set<string>(); // `${sessionId}:${roundIndex}` to dedupe close

function currentRound(session: Session): Round | null {
  if (session.currentRoundIndex < 0 || session.currentRoundIndex >= session.rounds.length) {
    return null;
  }
  return session.rounds[session.currentRoundIndex];
}

function connectedPlayerCount(session: Session): number {
  return Object.values(session.players).filter((p) => p.connected).length;
}

export function canStartMatch(session: Session): boolean {
  return session.status === 'lobby' && connectedPlayerCount(session) >= MIN_PLAYERS;
}

export async function startMatch(io: IoServer, session: Session): Promise<void> {
  if (session.status !== 'lobby') return;
  allocateRounds(session);
  session.currentRoundIndex = -1;
  await startNextRound(io, session);
}

async function startNextRound(io: IoServer, session: Session): Promise<void> {
  session.currentRoundIndex += 1;
  if (session.currentRoundIndex >= session.totalRounds) {
    endMatch(io, session);
    return;
  }

  const round = session.rounds[session.currentRoundIndex];
  const usedThemes = session.rounds
    .slice(0, session.currentRoundIndex)
    .map((r) => r.theme)
    .filter((t): t is string => !!t);

  const { theme } = await generateTheme(usedThemes);
  const startedAt = new Date();
  const deadline = new Date(startedAt.getTime() + ROUND_DURATION_MS);

  round.theme = theme;
  round.startedAt = startedAt.toISOString();
  round.deadline = deadline.toISOString();
  session.status = 'in_round';
  touchSession(session);

  const payload: RoundStartPayload = {
    roundIndex: round.index,
    theme,
    deadline: deadline.toISOString(),
  };
  io.to(session.id).emit(ServerEvent.RoundStart, payload);

  scheduleRoundTimer(io, session, round.index);
}

function scheduleRoundTimer(io: IoServer, session: Session, roundIndex: number): void {
  clearRoundTimer(session.id);
  const timer = setTimeout(() => {
    void closeRound(io, session, roundIndex, 'timeout');
  }, ROUND_DURATION_MS);
  roundTimers.set(session.id, timer);
}

function clearRoundTimer(sessionId: string): void {
  const t = roundTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    roundTimers.delete(sessionId);
  }
}

export interface SubmitResult {
  ok: boolean;
  code?: 'ALREADY_SUBMITTED' | 'SUBMISSION_CLOSED' | 'INVALID_WORD';
}

export function submitWord(
  io: IoServer,
  session: Session,
  playerId: string,
  rawWord: string,
): SubmitResult {
  if (session.status !== 'in_round') return { ok: false, code: 'SUBMISSION_CLOSED' };
  const round = currentRound(session);
  if (!round || !round.deadline) return { ok: false, code: 'SUBMISSION_CLOSED' };

  if (Date.now() > Date.parse(round.deadline)) {
    return { ok: false, code: 'SUBMISSION_CLOSED' };
  }

  const word = rawWord.trim();
  if (word.length === 0 || word.length > MAX_WORD_LENGTH) {
    return { ok: false, code: 'INVALID_WORD' };
  }

  if (round.submissions[playerId]) {
    return { ok: false, code: 'ALREADY_SUBMITTED' };
  }

  round.submissions[playerId] = {
    playerId,
    word,
    submittedAt: new Date().toISOString(),
  };
  touchSession(session);

  const progress: RoundProgressPayload = {
    roundIndex: round.index,
    submittedPlayerIds: Object.keys(round.submissions),
  };
  io.to(session.id).emit(ServerEvent.RoundProgress, progress);

  // Close early if every connected player has submitted.
  const connected = Object.values(session.players).filter((p) => p.connected);
  const allSubmitted = connected.every((p) => round.submissions[p.id]);
  if (allSubmitted && connected.length > 0) {
    clearRoundTimer(session.id);
    void closeRound(io, session, round.index, 'all_submitted');
  }

  return { ok: true };
}

async function closeRound(
  io: IoServer,
  session: Session,
  roundIndex: number,
  _cause: 'timeout' | 'all_submitted',
): Promise<void> {
  const key = `${session.id}:${roundIndex}`;
  if (closingRounds.has(key)) return;
  closingRounds.add(key);
  try {
    clearRoundTimer(session.id);
    const round = session.rounds[roundIndex];
    if (!round || round.revealedAt) return;

    const submissions = Object.values(round.submissions);
    const result = await adjudicate(round.theme ?? '', submissions);

    round.revealedAt = new Date().toISOString();
    round.winnerId = result.winnerId;
    round.reasoning = result.reasoning;
    round.adjudicationSource = result.source;

    if (result.winnerId && session.players[result.winnerId]) {
      session.players[result.winnerId].score += 1;
    }

    session.status = 'reveal';
    touchSession(session);

    const scores: Record<string, number> = {};
    for (const p of Object.values(session.players)) scores[p.id] = p.score;

    const reveal: RoundRevealPayload = {
      roundIndex: round.index,
      submissions: round.submissions,
      winnerId: round.winnerId,
      reasoning: round.reasoning ?? '',
      adjudicationSource: round.adjudicationSource ?? 'fallback',
      scores,
    };
    io.to(session.id).emit(ServerEvent.RoundReveal, reveal);

    setTimeout(() => {
      void startNextRound(io, session);
    }, REVEAL_DELAY_MS);
  } finally {
    closingRounds.delete(key);
  }
}

function endMatch(io: IoServer, session: Session): void {
  session.status = 'finished';
  touchSession(session);

  const players = Object.values(session.players);
  const finalScores = players
    .map((p) => ({ playerId: p.id, displayName: p.displayName, score: p.score }))
    .sort((a, b) => b.score - a.score);

  let winnerId: string | null = null;
  if (finalScores.length > 0) {
    const top = finalScores[0].score;
    const leaders = finalScores.filter((s) => s.score === top);
    winnerId = leaders.length === 1 ? leaders[0].playerId : null;
  }

  const summary: MatchSummary = {
    sessionId: session.id,
    finalScores,
    winnerId,
    rounds: session.rounds.map((r) => ({
      index: r.index,
      theme: r.theme ?? '',
      winnerId: r.winnerId,
      reasoning: r.reasoning ?? '',
      submissions: Object.values(r.submissions).map((s) => ({
        playerId: s.playerId,
        word: s.word,
      })),
    })),
  };

  io.to(session.id).emit(ServerEvent.MatchSummary, summary);
}

export function playersReady(session: Session): boolean {
  return playerCount(session) >= MIN_PLAYERS;
}
