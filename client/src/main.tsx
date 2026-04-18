import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { connectSocket } from './socket.js';
import { loadIdentity } from './storage.js';
import { useSessionStore } from './state/session.js';
import './styles.css';

// If this tab has a remembered room+player, reconnect before first render.
// The server will push room:state and our store will derive the correct phase.
const persisted = loadIdentity();
if (persisted) {
  connectSocket(persisted.roomCode, persisted.playerId);
  const store = useSessionStore.getState();
  store.setIdentity(persisted.roomCode, persisted.playerId);
  store.setPhase('lobby'); // neutral "connecting" screen; setSession will correct it
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
