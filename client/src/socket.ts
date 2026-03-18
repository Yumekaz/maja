import { io, Socket } from 'socket.io-client';
import type { SocketEvents } from './types';

const SOCKET_URL: string = window.location.origin;

// Get token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('accessToken');
}

// Socket type with our custom events
type TypedSocket = Socket<SocketEvents, SocketEvents>;

// Create socket with auth token
export const socket: TypedSocket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  auth: {
    token: getAuthToken(),
  },
});

// Update auth token on reconnect
socket.on('connect', () => {
  const token = getAuthToken();
  if (token) {
    (socket.auth as { token: string | null }).token = token;
  }
});

// Reconnect with new token after login
export function reconnectWithAuth(): void {
  (socket.auth as { token: string | null }).token = getAuthToken();
  socket.disconnect();
  socket.connect();
}

export default socket;
