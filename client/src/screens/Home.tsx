import { useState } from 'react';
import { createRoom, joinRoom } from '../api.js';
import { connectSocket } from '../socket.js';
import { useSessionStore } from '../state/session.js';

export function Home() {
  const setIdentity = useSessionStore((s) => s.setIdentity);
  const setPhase = useSessionStore((s) => s.setPhase);

  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalizedName = displayName.trim();
  const nameOk = normalizedName.length > 0 && normalizedName.length <= 20;

  async function handleCreate() {
    if (!nameOk) return;
    setBusy(true);
    setError(null);
    try {
      const { roomCode, playerId } = await createRoom(normalizedName);
      connectSocket(roomCode, playerId);
      setIdentity(roomCode, playerId);
      setPhase('lobby');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!nameOk || roomCode.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const code = roomCode.trim().toUpperCase();
      const { roomCode: joinedCode, playerId } = await joinRoom(code, normalizedName);
      connectSocket(joinedCode, playerId);
      setIdentity(joinedCode, playerId);
      setPhase('lobby');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join room');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col">
      <div className="panel col">
        <label>Your display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Nabil"
          maxLength={20}
        />
      </div>

      <div className="panel col">
        <h3>Create a new room</h3>
        <button disabled={!nameOk || busy} onClick={handleCreate}>
          Create room
        </button>
      </div>

      <div className="panel col">
        <h3>Join an existing room</h3>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="Room code (6 chars)"
          maxLength={6}
        />
        <button
          disabled={!nameOk || roomCode.trim().length === 0 || busy}
          onClick={handleJoin}
          className="ghost"
        >
          Join room
        </button>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
