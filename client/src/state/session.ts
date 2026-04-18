import { create } from 'zustand';
import type {
  ErrorPayload,
  MatchSummary,
  RoundRevealPayload,
  RoundStartPayload,
  Session,
} from '@semantic-duel/shared';
import { clearIdentity, saveIdentity } from '../storage.js';

export type Phase = 'home' | 'lobby' | 'round' | 'reveal' | 'summary';

interface SessionState {
  phase: Phase;
  roomCode: string | null;
  playerId: string | null;
  session: Session | null;

  currentRound: RoundStartPayload | null;
  submittedPlayerIds: string[];
  lastReveal: RoundRevealPayload | null;
  summary: MatchSummary | null;

  lastError: ErrorPayload | null;

  setIdentity: (roomCode: string, playerId: string) => void;
  setPhase: (phase: Phase) => void;
  setSession: (session: Session) => void;
  setRoundStart: (p: RoundStartPayload) => void;
  setSubmittedPlayerIds: (ids: string[]) => void;
  setReveal: (p: RoundRevealPayload) => void;
  setSummary: (s: MatchSummary) => void;
  setError: (e: ErrorPayload | null) => void;
  reset: () => void;
}

function synthesizeSummary(session: Session): MatchSummary {
  const finalScores = Object.values(session.players)
    .map((p) => ({ playerId: p.id, displayName: p.displayName, score: p.score }))
    .sort((a, b) => b.score - a.score);

  let winnerId: string | null = null;
  if (finalScores.length > 0) {
    const top = finalScores[0].score;
    const leaders = finalScores.filter((s) => s.score === top);
    winnerId = leaders.length === 1 ? leaders[0].playerId : null;
  }

  return {
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
}

export const useSessionStore = create<SessionState>((set) => ({
  phase: 'home',
  roomCode: null,
  playerId: null,
  session: null,
  currentRound: null,
  submittedPlayerIds: [],
  lastReveal: null,
  summary: null,
  lastError: null,

  setIdentity: (roomCode, playerId) => {
    saveIdentity({ roomCode, playerId });
    set({ roomCode, playerId });
  },
  setPhase: (phase) => set({ phase }),
  setSession: (session) => {
    set((prev) => {
      const round =
        session.currentRoundIndex >= 0 && session.currentRoundIndex < session.rounds.length
          ? session.rounds[session.currentRoundIndex]
          : null;

      let phase = prev.phase;
      let currentRound = prev.currentRound;
      let lastReveal = prev.lastReveal;
      let summary = prev.summary;
      let submittedPlayerIds = prev.submittedPlayerIds;

      if (session.status === 'lobby') {
        phase = 'lobby';
      } else if (session.status === 'in_round') {
        phase = 'round';
        if (round && round.theme && round.deadline) {
          // Reseat the round header if it's a different round than we last saw.
          if (!currentRound || currentRound.roundIndex !== round.index) {
            currentRound = {
              roundIndex: round.index,
              theme: round.theme,
              deadline: round.deadline,
            };
            submittedPlayerIds = Object.keys(round.submissions);
          }
        }
      } else if (session.status === 'reveal') {
        phase = 'reveal';
        if (round && round.revealedAt) {
          const scores: Record<string, number> = {};
          for (const p of Object.values(session.players)) scores[p.id] = p.score;
          lastReveal = {
            roundIndex: round.index,
            submissions: round.submissions,
            winnerId: round.winnerId,
            reasoning: round.reasoning ?? '',
            adjudicationSource: round.adjudicationSource ?? 'fallback',
            scores,
          };
        }
      } else if (session.status === 'finished') {
        phase = 'summary';
        if (!summary) summary = synthesizeSummary(session);
      }

      return { session, phase, currentRound, lastReveal, summary, submittedPlayerIds };
    });
  },
  setRoundStart: (p) =>
    set({
      phase: 'round',
      currentRound: p,
      submittedPlayerIds: [],
      lastReveal: null,
    }),
  setSubmittedPlayerIds: (ids) => set({ submittedPlayerIds: ids }),
  setReveal: (p) => set({ phase: 'reveal', lastReveal: p }),
  setSummary: (s) => set({ phase: 'summary', summary: s }),
  setError: (e) => set({ lastError: e }),
  reset: () => {
    clearIdentity();
    set({
      phase: 'home',
      roomCode: null,
      playerId: null,
      session: null,
      currentRound: null,
      submittedPlayerIds: [],
      lastReveal: null,
      summary: null,
      lastError: null,
    });
  },
}));
