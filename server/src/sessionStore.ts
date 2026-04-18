import { randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  SESSION_IDLE_TIMEOUT_MS,
  TOTAL_ROUNDS,
  type Player,
  type Round,
  type Session,
} from '@semantic-duel/shared';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

const sessions = new Map<string, Session>();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!sessions.has(code)) return code;
  }
  throw new Error('Could not allocate a unique room code');
}

export function createSession(hostDisplayName: string): { session: Session; hostId: string } {
  const roomCode = generateRoomCode();
  const hostId = randomUUID();
  const nowIso = new Date().toISOString();

  const host: Player = {
    id: hostId,
    displayName: hostDisplayName,
    score: 0,
    connected: false, // flips to true once the socket connects
    joinedAt: nowIso,
  };

  const session: Session = {
    id: roomCode,
    hostId,
    status: 'lobby',
    players: { [hostId]: host },
    rounds: [],
    currentRoundIndex: -1,
    totalRounds: TOTAL_ROUNDS,
    createdAt: nowIso,
    lastActivityAt: nowIso,
  };

  sessions.set(roomCode, session);
  return { session, hostId };
}

export function getSession(roomCode: string): Session | undefined {
  return sessions.get(roomCode.toUpperCase());
}

export function deleteSession(roomCode: string): void {
  sessions.delete(roomCode.toUpperCase());
}

export function touchSession(session: Session): void {
  session.lastActivityAt = new Date().toISOString();
}

export function addPlayer(session: Session, displayName: string): Player {
  const playerId = randomUUID();
  const player: Player = {
    id: playerId,
    displayName,
    score: 0,
    connected: false,
    joinedAt: new Date().toISOString(),
  };
  session.players[playerId] = player;
  touchSession(session);
  return player;
}

export function playerCount(session: Session): number {
  return Object.keys(session.players).length;
}

export function isRoomFull(session: Session): boolean {
  return playerCount(session) >= MAX_PLAYERS;
}

export function allocateRounds(session: Session): void {
  const rounds: Round[] = [];
  for (let i = 0; i < session.totalRounds; i++) {
    rounds.push({
      id: randomUUID(),
      index: i,
      theme: null,
      startedAt: null,
      deadline: null,
      submissions: {},
      revealedAt: null,
      winnerId: null,
      reasoning: null,
      adjudicationSource: null,
    });
  }
  session.rounds = rounds;
}

export function listSessions(): Session[] {
  return Array.from(sessions.values());
}

// Periodic GC for idle sessions.
export function startIdleGc(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions) {
      const last = Date.parse(session.lastActivityAt);
      const allDisconnected = Object.values(session.players).every((p) => !p.connected);
      if (allDisconnected && now - last > SESSION_IDLE_TIMEOUT_MS) {
        sessions.delete(code);
      }
    }
  }, intervalMs).unref();
}
