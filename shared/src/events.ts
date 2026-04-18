// Socket.IO event name constants. Use these on both sides so a typo fails at compile time.

export const ClientEvent = {
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomClose: 'room:close',
  MatchStart: 'match:start',
  RoundSubmit: 'round:submit',
} as const;

export const ServerEvent = {
  RoomState: 'room:state',
  RoomPlayerJoined: 'room:player_joined',
  RoomPlayerLeft: 'room:player_left',
  RoomClosed: 'room:closed',
  RoundStart: 'round:start',
  RoundProgress: 'round:progress',
  RoundReveal: 'round:reveal',
  MatchSummary: 'match:summary',
  Error: 'error',
} as const;

export type ClientEventName = (typeof ClientEvent)[keyof typeof ClientEvent];
export type ServerEventName = (typeof ServerEvent)[keyof typeof ServerEvent];
