import type { Server as IoServer, Socket } from 'socket.io';
import {
  ClientEvent,
  ServerEvent,
  type ErrorCode,
  type ErrorPayload,
  type RoomClosedPayload,
  type RoomPlayerJoinedPayload,
  type RoomPlayerLeftPayload,
  type RoundSubmitPayload,
  type Session,
} from '@semantic-duel/shared';
import { canStartMatch, startMatch, submitWord } from './matchEngine.js';
import { deleteSession, getSession, touchSession } from './sessionStore.js';

interface SocketAuth {
  playerId?: string;
  roomCode?: string;
}

function emitError(socket: Socket, code: ErrorCode, message: string): void {
  const payload: ErrorPayload = { code, message };
  socket.emit(ServerEvent.Error, payload);
}

function broadcastState(io: IoServer, session: Session): void {
  io.to(session.id).emit(ServerEvent.RoomState, session);
}

export function registerHandlers(io: IoServer): void {
  io.on('connection', (socket) => {
    const auth = (socket.handshake.auth ?? {}) as SocketAuth;
    const roomCode = auth.roomCode?.toUpperCase();
    const playerId = auth.playerId;

    if (!roomCode || !playerId) {
      emitError(socket, 'UNAUTHORIZED', 'Missing playerId or roomCode');
      socket.disconnect();
      return;
    }

    const session = getSession(roomCode);
    if (!session || !session.players[playerId]) {
      emitError(socket, 'ROOM_NOT_FOUND', 'Room or player not found');
      socket.disconnect();
      return;
    }

    // Bind this socket to the room and player.
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    void socket.join(roomCode);

    session.players[playerId].connected = true;
    touchSession(session);

    // Announce the (re)join and push updated state to everyone in the room.
    const joinedPayload: RoomPlayerJoinedPayload = { player: session.players[playerId] };
    socket.to(roomCode).emit(ServerEvent.RoomPlayerJoined, joinedPayload);
    broadcastState(io, session);

    socket.on(ClientEvent.RoomJoin, () => {
      // Idempotent: re-send state on request.
      const s = getSession(roomCode);
      if (s) socket.emit(ServerEvent.RoomState, s);
    });

    socket.on(ClientEvent.RoomLeave, () => {
      const s = getSession(roomCode);
      if (s && s.players[playerId] && s.hostId !== playerId) {
        delete s.players[playerId];
        touchSession(s);
        const left: RoomPlayerLeftPayload = { playerId };
        socket.to(roomCode).emit(ServerEvent.RoomPlayerLeft, left);
        broadcastState(io, s);
      }
      socket.disconnect();
    });

    socket.on(ClientEvent.RoomClose, () => {
      const s = getSession(roomCode);
      if (!s) return emitError(socket, 'ROOM_NOT_FOUND', 'Room not found');
      if (s.hostId !== playerId) return emitError(socket, 'NOT_HOST', 'Only the host can close the room');
      const payload: RoomClosedPayload = { reason: 'host_closed' };
      io.to(roomCode).emit(ServerEvent.RoomClosed, payload);
      deleteSession(roomCode);
      io.in(roomCode).disconnectSockets();
    });

    socket.on(ClientEvent.MatchStart, () => {
      const s = getSession(roomCode);
      if (!s) return emitError(socket, 'ROOM_NOT_FOUND', 'Room not found');
      if (s.hostId !== playerId) return emitError(socket, 'NOT_HOST', 'Only the host can start');
      if (!canStartMatch(s)) {
        return emitError(socket, 'TOO_FEW_PLAYERS', 'Need at least 2 connected players');
      }
      void startMatch(io, s);
    });

    socket.on(ClientEvent.RoundSubmit, (payload: RoundSubmitPayload) => {
      const s = getSession(roomCode);
      if (!s) return emitError(socket, 'ROOM_NOT_FOUND', 'Room not found');
      const result = submitWord(io, s, playerId, payload?.word ?? '');
      if (!result.ok && result.code) {
        const msg = {
          ALREADY_SUBMITTED: 'You already submitted a word for this round.',
          SUBMISSION_CLOSED: 'Submission is closed.',
          INVALID_WORD: 'Word must be 1-40 characters.',
        }[result.code];
        emitError(socket, result.code, msg);
      }
    });

    socket.on('disconnect', () => {
      const s = getSession(roomCode);
      if (!s || !s.players[playerId]) return;
      s.players[playerId].connected = false;
      touchSession(s);
      const left: RoomPlayerLeftPayload = { playerId };
      socket.to(roomCode).emit(ServerEvent.RoomPlayerLeft, left);
      broadcastState(io, s);
    });
  });
}
