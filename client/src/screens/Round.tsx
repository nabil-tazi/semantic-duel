import { useEffect, useMemo, useState } from 'react';
import { ClientEvent, MAX_WORD_LENGTH } from '@semantic-duel/shared';
import { getSocket } from '../socket.js';
import { useSessionStore } from '../state/session.js';

export function Round() {
  const currentRound = useSessionStore((s) => s.currentRound);
  const session = useSessionStore((s) => s.session);
  const playerId = useSessionStore((s) => s.playerId);
  const submittedIds = useSessionStore((s) => s.submittedPlayerIds);
  const lastError = useSessionStore((s) => s.lastError);

  const [word, setWord] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Reset local submission state when a new round starts.
  useEffect(() => {
    setWord('');
    setSubmitted(false);
  }, [currentRound?.roundIndex]);

  const remainingMs = useMemo(() => {
    if (!currentRound) return 0;
    return Math.max(0, Date.parse(currentRound.deadline) - now);
  }, [currentRound, now]);

  if (!currentRound || !session || !playerId) {
    return <div className="panel">Waiting for the round to start…</div>;
  }

  const seconds = Math.ceil(remainingMs / 1000);
  const timerLow = seconds <= 5;
  const hasSubmittedServer = submittedIds.includes(playerId);
  const locked = submitted || hasSubmittedServer || remainingMs <= 0;

  function submit() {
    const trimmed = word.trim();
    if (!trimmed || trimmed.length > MAX_WORD_LENGTH) return;
    getSocket()?.emit(ClientEvent.RoundSubmit, { word: trimmed });
    setSubmitted(true);
  }

  const players = Object.values(session.players);
  const connectedCount = players.filter((p) => p.connected).length;

  return (
    <div className="col">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted">
              Round {currentRound.roundIndex + 1} / {session.totalRounds}
            </div>
            <div className="theme">{currentRound.theme}</div>
          </div>
          <div className={`timer ${timerLow ? 'low' : ''}`}>{seconds}s</div>
        </div>
      </div>

      <div className="panel col">
        <label>Your word (fits the theme)</label>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="One word"
          maxLength={MAX_WORD_LENGTH}
          disabled={locked}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !locked) submit();
          }}
        />
        <button disabled={locked || word.trim().length === 0} onClick={submit}>
          {locked ? 'Submitted — waiting for others' : 'Submit'}
        </button>
        <div className="muted">
          {submittedIds.length} / {connectedCount} players have submitted.
        </div>
        {lastError && <div className="error">{lastError.message}</div>}
      </div>
    </div>
  );
}
