import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
} from '@semantic-duel/shared';
import { SERVER_URL } from './socket.js';

export async function createRoom(displayName: string): Promise<CreateRoomResponse> {
  const body: CreateRoomRequest = { displayName };
  const res = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create room');
  return res.json();
}

export async function joinRoom(code: string, displayName: string): Promise<JoinRoomResponse> {
  const body: JoinRoomRequest = { displayName };
  const res = await fetch(`${SERVER_URL}/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to join room');
  }
  return res.json();
}
