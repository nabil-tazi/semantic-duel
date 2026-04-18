const KEY = 'semantic-duel:identity';

export interface PersistedIdentity {
  roomCode: string;
  playerId: string;
}

export function loadIdentity(): PersistedIdentity | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedIdentity>;
    if (typeof parsed.roomCode === 'string' && typeof parsed.playerId === 'string') {
      return { roomCode: parsed.roomCode, playerId: parsed.playerId };
    }
  } catch {
    // fall through to null
  }
  return null;
}

export function saveIdentity(id: PersistedIdentity): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    // storage disabled — nothing we can do
  }
}

export function clearIdentity(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
