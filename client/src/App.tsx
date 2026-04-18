import { useEffect } from 'react';
import {
  ServerEvent,
  type ErrorPayload,
  type MatchSummary,
  type RoomClosedPayload,
  type RoomPlayerJoinedPayload,
  type RoomPlayerLeftPayload,
  type RoundProgressPayload,
  type RoundRevealPayload,
  type RoundStartPayload,
  type Session,
} from '@semantic-duel/shared';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { Reveal } from './screens/Reveal.js';
import { Round } from './screens/Round.js';
import { Summary } from './screens/Summary.js';
import { disconnectSocket, getSocket } from './socket.js';
import { useSessionStore } from './state/session.js';

export function App() {
  const phase = useSessionStore((s) => s.phase);
  const roomCode = useSessionStore((s) => s.roomCode);
  const setSession = useSessionStore((s) => s.setSession);
  const setRoundStart = useSessionStore((s) => s.setRoundStart);
  const setSubmittedPlayerIds = useSessionStore((s) => s.setSubmittedPlayerIds);
  const setReveal = useSessionStore((s) => s.setReveal);
  const setSummary = useSessionStore((s) => s.setSummary);
  const setError = useSessionStore((s) => s.setError);
  const reset = useSessionStore((s) => s.reset);

  useEffect(() => {
    if (!roomCode) return;
    const socket = getSocket();
    if (!socket) return;

    const onState = (s: Session) => setSession(s);
    const onPlayerJoined = (_: RoomPlayerJoinedPayload) => {
      // room:state will follow; nothing to do here specifically
    };
    const onPlayerLeft = (_: RoomPlayerLeftPayload) => {
      // same
    };
    const onRoundStart = (p: RoundStartPayload) => setRoundStart(p);
    const onRoundProgress = (p: RoundProgressPayload) =>
      setSubmittedPlayerIds(p.submittedPlayerIds);
    const onReveal = (p: RoundRevealPayload) => setReveal(p);
    const onSummary = (s: MatchSummary) => setSummary(s);
    const onRoomClosed = (_: RoomClosedPayload) => {
      disconnectSocket();
      reset();
      setError({ code: 'ROOM_NOT_FOUND', message: 'The host closed this room.' });
    };
    const onError = (e: ErrorPayload) => {
      setError(e);
      // Auth-style failures on reconnect mean our remembered identity is dead — go home.
      if (e.code === 'UNAUTHORIZED' || e.code === 'ROOM_NOT_FOUND') {
        disconnectSocket();
        reset();
      }
    };

    socket.on(ServerEvent.RoomState, onState);
    socket.on(ServerEvent.RoomPlayerJoined, onPlayerJoined);
    socket.on(ServerEvent.RoomPlayerLeft, onPlayerLeft);
    socket.on(ServerEvent.RoundStart, onRoundStart);
    socket.on(ServerEvent.RoundProgress, onRoundProgress);
    socket.on(ServerEvent.RoundReveal, onReveal);
    socket.on(ServerEvent.MatchSummary, onSummary);
    socket.on(ServerEvent.RoomClosed, onRoomClosed);
    socket.on(ServerEvent.Error, onError);

    return () => {
      socket.off(ServerEvent.RoomState, onState);
      socket.off(ServerEvent.RoomPlayerJoined, onPlayerJoined);
      socket.off(ServerEvent.RoomPlayerLeft, onPlayerLeft);
      socket.off(ServerEvent.RoundStart, onRoundStart);
      socket.off(ServerEvent.RoundProgress, onRoundProgress);
      socket.off(ServerEvent.RoundReveal, onReveal);
      socket.off(ServerEvent.MatchSummary, onSummary);
      socket.off(ServerEvent.RoomClosed, onRoomClosed);
      socket.off(ServerEvent.Error, onError);
    };
  }, [
    roomCode,
    setSession,
    setRoundStart,
    setSubmittedPlayerIds,
    setReveal,
    setSummary,
    setError,
    reset,
  ]);

  return (
    <div className="app">
      <h1>Semantic Duel</h1>
      {phase === 'home' && <Home />}
      {phase === 'lobby' && <Lobby />}
      {phase === 'round' && <Round />}
      {phase === 'reveal' && <Reveal />}
      {phase === 'summary' && <Summary />}
    </div>
  );
}
