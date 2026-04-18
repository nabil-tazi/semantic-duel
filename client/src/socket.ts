import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function connectSocket(roomCode: string, playerId: string): Socket {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(SERVER_URL, {
    auth: { roomCode, playerId },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export { SERVER_URL };
