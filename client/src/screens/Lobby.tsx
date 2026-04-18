import { useEffect, useState } from 'react';
import { ClientEvent, MIN_PLAYERS } from '@semantic-duel/shared';
import { disconnectSocket, getSocket } from '../socket.js';
import { useSessionStore } from '../state/session.js';

export function Lobby() {
  const session = useSessionStore((s) => s.session);
  const playerId = useSessionStore((s) => s.playerId);
  const roomCode = useSessionStore((s) => s.roomCode);
  const lastError = useSessionStore((s) => s.lastError);
  const reset = useSessionStore((s) => s.reset);

  const [starting, setStarting] = useState(false);

  // If the server rejected (e.g. too few players), stop showing the loader.
  useEffect(() => {
    if (starting && lastError) setStarting(false);
  }, [starting, lastError]);

  if (!session || !roomCode) {
    return <div className="panel">Connecting…</div>;
  }

  const isHost = session.hostId === playerId;
  const players = Object.values(session.players);
  const connectedCount = players.filter((p) => p.connected).length;
  const canStart = isHost && connectedCount >= MIN_PLAYERS;

  function start() {
    setStarting(true);
    getSocket()?.emit(ClientEvent.MatchStart);
  }

  function leave() {
    getSocket()?.emit(ClientEvent.RoomLeave);
    disconnectSocket();
    reset();
  }

  function closeRoom() {
    if (!confirm('Close this room for everyone?')) return;
    getSocket()?.emit(ClientEvent.RoomClose);
  }

  return (
    <div className="col">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted">Room code</div>
            <div className="code">{roomCode}</div>
          </div>
          <div>
            <div className="muted">Players</div>
            <div className="code">
              {connectedCount}/{session.totalRounds > 0 ? 20 : 20}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>In the room</h3>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id}>
              <span>
                {p.displayName}
                {p.id === session.hostId && <span className="badge">host</span>}
                {p.id === playerId && <span className="badge">you</span>}
              </span>
              {p.connected ? (
                <span className="muted">ready</span>
              ) : (
                <span className="disc">disconnected</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel col">
        {isHost ? (
          <>
            <button disabled={!canStart || starting} onClick={start}>
              {starting ? (
                <>
                  <span className="spinner" />
                  Preparing round 1…
                </>
              ) : (
                <>Start match ({session.totalRounds} rounds)</>
              )}
            </button>
            {!canStart && !starting && (
              <div className="muted">Need at least {MIN_PLAYERS} connected players.</div>
            )}
            {starting && (
              <div className="muted">Generating the first theme — this can take a few seconds.</div>
            )}
            <button className="ghost" onClick={closeRoom} disabled={starting}>
              Close room
            </button>
          </>
        ) : (
          <>
            <div className="muted">Waiting for the host to start the match…</div>
            <button className="ghost" onClick={leave}>
              Leave room
            </button>
          </>
        )}
        {lastError && <div className="error">{lastError.message}</div>}
      </div>
    </div>
  );
}
