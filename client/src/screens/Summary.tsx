import { disconnectSocket } from '../socket.js';
import { useSessionStore } from '../state/session.js';

export function Summary() {
  const summary = useSessionStore((s) => s.summary);
  const reset = useSessionStore((s) => s.reset);

  if (!summary) return <div className="panel">Loading summary…</div>;

  function playAgain() {
    disconnectSocket();
    reset();
  }

  const winnerName = summary.winnerId
    ? summary.finalScores.find((s) => s.playerId === summary.winnerId)?.displayName
    : null;

  return (
    <div className="col">
      <div className="panel">
        <h2>Match complete</h2>
        {winnerName ? (
          <div className="theme">{winnerName} wins the match</div>
        ) : (
          <div className="theme">It's a tie at the top</div>
        )}

        <h3>Final scores</h3>
        <ul className="players">
          {summary.finalScores.map((s) => (
            <li key={s.playerId}>
              <span>{s.displayName}</span>
              <span className="score">{s.score}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3>Round recap</h3>
        {summary.rounds.map((r) => (
          <div key={r.index} style={{ marginBottom: 12 }}>
            <div className="muted">
              Round {r.index + 1} — {r.theme}
            </div>
            <div>
              {r.submissions.map((s) => {
                const name =
                  summary.finalScores.find((fs) => fs.playerId === s.playerId)?.displayName ?? s.playerId;
                const isWinner = s.playerId === r.winnerId;
                return (
                  <span key={s.playerId} style={{ marginRight: 12 }}>
                    <strong style={{ color: isWinner ? 'var(--winner)' : undefined }}>
                      {s.word}
                    </strong>{' '}
                    <span className="muted">({name})</span>
                  </span>
                );
              })}
            </div>
            {r.reasoning && <div className="reasoning">{r.reasoning}</div>}
          </div>
        ))}
      </div>

      <div className="panel">
        <button onClick={playAgain}>Back to home</button>
      </div>
    </div>
  );
}
