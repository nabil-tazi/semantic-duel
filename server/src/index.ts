import cors from '@fastify/cors';
import Fastify from 'fastify';
import { Server as IoServer } from 'socket.io';
import {
  MAX_DISPLAY_NAME_LENGTH,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
} from '@semantic-duel/shared';
import { registerHandlers } from './roomHandlers.js';
import {
  addPlayer,
  createSession,
  getSession,
  isRoomFull,
  startIdleGc,
} from './sessionStore.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

function validateDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) return null;
  return trimmed;
}

async function main(): Promise<void> {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  });

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post<{ Body: CreateRoomRequest; Reply: CreateRoomResponse | { error: string } }>(
    '/rooms',
    async (req, reply) => {
      const displayName = validateDisplayName(req.body?.displayName);
      if (!displayName) {
        reply.code(400);
        return { error: 'Invalid displayName' };
      }
      const { session, hostId } = createSession(displayName);
      return { roomCode: session.id, playerId: hostId };
    },
  );

  fastify.post<{
    Params: { code: string };
    Body: JoinRoomRequest;
    Reply: JoinRoomResponse | { error: string };
  }>('/rooms/:code/join', async (req, reply) => {
    const displayName = validateDisplayName(req.body?.displayName);
    if (!displayName) {
      reply.code(400);
      return { error: 'Invalid displayName' };
    }

    const session = getSession(req.params.code);
    if (!session) {
      reply.code(404);
      return { error: 'ROOM_NOT_FOUND' };
    }
    if (session.status !== 'lobby') {
      reply.code(409);
      return { error: 'MATCH_IN_PROGRESS' };
    }
    if (isRoomFull(session)) {
      reply.code(409);
      return { error: 'ROOM_FULL' };
    }

    const player = addPlayer(session, displayName);
    return { roomCode: session.id, playerId: player.id };
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });

  const io = new IoServer(fastify.server, {
    cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  });
  registerHandlers(io);
  startIdleGc();

  fastify.log.info(`Socket.IO listening on :${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
