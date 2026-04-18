import { useSessionStore } from '../state/session.js';

export function Reveal() {
  const reveal = useSessionStore((s) => s.lastReveal);
  const session = useSessionStore((s) => s.session);

  if (!reveal || !session) return <div className="panel">Judging…</div>;

  const submissions = Object.values(reveal.submissions);
  const winnerId = reveal.winnerId;

  const playerName = (id: string) => session.players[id]?.displayName ?? 'Unknown';
  const scoreList = Object.entries(reveal.scores)
    .map(([pid, score]) => ({ pid, score, name: playerName(pid) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="col">
      <div className="panel">
        <div className="muted">
          Round {reveal.roundIndex + 1} reveal
          {reveal.adjudicationSource === 'fallback' && (
            <span className="badge">fallback verdict</span>
          )}
        </div>
        <h2>
          {winnerId ? `${playerName(winnerId)} wins the round` : 'No winner this round'}
        </h2>

        <div className="submission-grid">
          {submissions.map((s) => (
            <div
              key={s.playerId}
              className={`submission-card ${s.playerId === winnerId ? 'winner' : ''}`}
            >
              <div className="name">{playerName(s.playerId)}</div>
              <div className="word">{s.word}</div>
            </div>
          ))}
        </div>

        {reveal.reasoning && <div className="reasoning">{reveal.reasoning}</div>}
      </div>

      <div className="panel">
        <h3>Scores</h3>
        <ul className="players">
          {scoreList.map((s) => (
            <li key={s.pid}>
              <span>{s.name}</span>
              <span className="score">{s.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
