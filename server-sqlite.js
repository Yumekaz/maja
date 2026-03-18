/**
 * E2E Encrypted Messenger Server - SQLite Edition
 * 
 * Features:
 * - End-to-end encryption (server never sees plaintext)
 * - SQLite persistence (survives restarts)
 * - Message state machine (pending → delivered → read)
 * - Room-based group messaging with owner approval
 * - Public key exchange via server
 * - HTTPS support for offline mobile connections
 * 
 * Architecture:
 * - Database: SQLite with sql.js (pure JS, no native deps)
 * - Real-time: Socket.IO for WebSocket communication
 * - In-memory: Only transient data (socket mappings, pending requests)
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIO = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();

// Check for SSL certificates
const SSL_KEY = path.join(__dirname, 'ssl', 'key.pem');
const SSL_CERT = path.join(__dirname, 'ssl', 'cert.pem');
const hasSSL = fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT);

// Create HTTP server
const httpServer = http.createServer(app);

// Create HTTPS server if certificates exist
let httpsServer = null;
if (hasSSL) {
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT)
  };
  httpsServer = https.createServer(sslOptions, app);
}

// Socket.IO with both servers
const io = socketIO(hasSSL ? httpsServer : httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Also attach to HTTP server if HTTPS is primary
if (hasSSL) {
  io.attach(httpServer);
}

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// ==================== IN-MEMORY STATE (Transient Only) ====================
// These don't need persistence - they're session-specific

const socketToUser = new Map();     // socketId → username
const userToSocket = new Map();     // username → socketId (for online users)
const joinRequests = new Map();     // requestId → { username, roomId, socketId }
const socketToRooms = new Map();    // socketId → Set<roomId> (socket.io room tracking)

let roomCounter = 0;  // Will be synced from DB on startup
let requestCounter = 0;

// ==================== HELPERS ====================

/**
 * Generate secure 6-character room code
 */
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Generate unique message ID
 */
function generateMessageId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Get room counter from database (for continuity after restart)
 */
function initializeRoomCounter() {
  const stats = db.getStats();
  roomCounter = stats.rooms;
  console.log(`[INIT] Room counter set to ${roomCounter}`);
}

/**
 * Build member keys object from database
 */
function getMemberKeysObject(roomId) {
  const members = db.getRoomMembers(roomId);
  return members.reduce((acc, member) => {
    acc[member.username] = member.public_key;
    return acc;
  }, {});
}

/**
 * Get online members in a room
 */
function getOnlineMembers(roomId) {
  const members = db.getRoomMembers(roomId);
  return members.filter(m => userToSocket.has(m.username));
}

/**
 * Notify room members about state change
 */
function notifyMessageStateChange(roomId, messageId, newState, updatedBy) {
  io.to(roomId).emit('message-state-changed', {
    messageId,
    state: newState,
    updatedBy,
    timestamp: Date.now()
  });
}

// ==================== EXPRESS ROUTES ====================

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public_build')));

// API endpoint: Get server stats
app.get('/api/stats', (req, res) => {
  const stats = db.getStats();
  const onlineUsers = userToSocket.size;
  res.json({ ...stats, onlineUsers });
});

// API endpoint: Get network info for QR code generation
app.get('/api/network-info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';

  // Priority order: prefer Mobile Hotspot, then Wi-Fi and Ethernet over virtual adapters
  // "Local Area Connection*" is Windows Mobile Hotspot adapter name
  const priorityOrder = ['Local Area Connection*', 'Wi-Fi', 'Ethernet', 'en0', 'eth0', 'wlan0'];
  const skipPatterns = ['vEthernet', 'WSL', 'Hyper-V', 'VirtualBox', 'VMware', 'Docker', 'Loopback'];

  // First pass: look for priority interfaces
  for (const priority of priorityOrder) {
    for (const name of Object.keys(interfaces)) {
      if (name.toLowerCase().includes(priority.toLowerCase())) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address;
            break;
          }
        }
      }
      if (localIP !== 'localhost') break;
    }
    if (localIP !== 'localhost') break;
  }

  // Second pass: if still localhost, find any non-virtual interface
  if (localIP === 'localhost') {
    for (const name of Object.keys(interfaces)) {
      // Skip virtual adapters
      if (skipPatterns.some(pattern => name.includes(pattern))) continue;

      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }
  }

  res.json({
    ip: localIP,
    port: PORT,
    httpsPort: HTTPS_PORT,
    httpUrl: `http://${localIP}:${PORT}`,
    httpsUrl: `https://${localIP}:${HTTPS_PORT}`,
    url: hasSSL ? `https://${localIP}:${HTTPS_PORT}` : `http://${localIP}:${PORT}`
  });
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public_build', 'index.html'));
});

// ==================== SOCKET.IO HANDLERS ====================

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);
  socketToRooms.set(socket.id, new Set());

  // ---------- 1. REGISTER ----------
  socket.on('register', ({ username, publicKey }) => {
    // Check if username is taken by another ONLINE user
    if (userToSocket.has(username) && userToSocket.get(username) !== socket.id) {
      socket.emit('username-taken');
      return;
    }

    // Upsert user in database (creates or updates)
    db.upsertUser(username, publicKey);

    // Update socket mappings
    socketToUser.set(socket.id, username);
    userToSocket.set(username, socket.id);

    socket.emit('registered', { username });
    console.log(`[REGISTER] ${username} (persisted to DB)`);
  });

  // ---------- 2. CREATE ROOM ----------
  socket.on('create-room', () => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    const roomId = `room_${++roomCounter}`;
    const roomCode = generateRoomCode();

    // Persist room to database
    db.createRoom(roomId, roomCode, username);

    // Join socket.io room
    socket.join(roomId);
    socketToRooms.get(socket.id).add(roomId);

    socket.emit('room-created', { roomId, roomCode });
    console.log(`[ROOM] ${username} created ${roomCode} (persisted)`);
  });

  // ---------- 3. REQUEST JOIN ----------
  socket.on('request-join', ({ roomCode }) => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    // Find room in database
    const room = db.getRoomByCode(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check if already a member
    if (db.isRoomMember(room.room_id, username)) {
      socket.emit('error', { message: 'Already in room' });
      return;
    }

    // Get user's public key
    const user = db.getUser(username);
    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const requestId = `req_${++requestCounter}`;
    joinRequests.set(requestId, {
      username,
      publicKey: user.public_key,
      roomId: room.room_id,
      socketId: socket.id
    });

    // Send to room owner if online
    const ownerSocketId = userToSocket.get(room.owner_username);
    if (ownerSocketId) {
      io.to(ownerSocketId).emit('join-request', {
        requestId,
        username,
        publicKey: user.public_key,
        roomId: room.room_id
      });
    }

    console.log(`[JOIN-REQ] ${username} -> ${room.room_id}`);
  });

  // ---------- 4. APPROVE JOIN ----------
  socket.on('approve-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    const approverUsername = socketToUser.get(socket.id);
    const room = db.getRoomById(request.roomId);

    if (!room || room.owner_username !== approverUsername) {
      return;
    }

    // Add member to database
    db.addRoomMember(request.roomId, request.username);

    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.join(request.roomId);
      socketToRooms.get(request.socketId)?.add(request.roomId);

      // Get all member keys from database
      const memberKeys = getMemberKeysObject(request.roomId);
      const members = Object.keys(memberKeys);

      requesterSocket.emit('join-approved', {
        roomId: request.roomId,
        roomCode: room.room_code,
        memberKeys
      });

      // Notify existing members
      socket.to(request.roomId).emit('member-joined', {
        username: request.username,
        publicKey: request.publicKey
      });

      io.to(request.roomId).emit('members-update', {
        members,
        memberKeys
      });

      console.log(`[APPROVED] ${request.username} joined ${request.roomId} (persisted)`);
    }

    joinRequests.delete(requestId);
  });

  // ---------- 5. DENY JOIN ----------
  socket.on('deny-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    const denierUsername = socketToUser.get(socket.id);
    const room = db.getRoomById(request.roomId);

    if (!room || room.owner_username !== denierUsername) return;

    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.emit('join-denied');
    }

    joinRequests.delete(requestId);
    console.log(`[DENIED] ${request.username}`);
  });

  // ---------- 6. JOIN ROOM (Reconnection) ----------
  socket.on('join-room', ({ roomId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    const room = db.getRoomById(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (!db.isRoomMember(roomId, username)) {
      socket.emit('error', { message: 'Not a member' });
      return;
    }

    socket.join(roomId);
    socketToRooms.get(socket.id)?.add(roomId);

    // Get data from database
    const memberKeys = getMemberKeysObject(roomId);
    const messages = db.getRoomMessages(roomId, 100);

    // Mark pending messages as delivered
    const pendingIds = messages
      .filter(m => m.state === 'pending' && m.sender_username !== username)
      .map(m => m.message_id);

    if (pendingIds.length > 0) {
      db.markMessagesDelivered(pendingIds, username);

      // Notify senders about delivery
      pendingIds.forEach(msgId => {
        notifyMessageStateChange(roomId, msgId, db.MessageState.DELIVERED, username);
      });
    }

    // Transform messages for client
    const encryptedMessages = messages.map(m => ({
      id: m.message_id,
      encryptedData: m.encrypted_data,
      iv: m.iv,
      senderUsername: m.sender_username,
      timestamp: new Date(m.created_at).getTime(),
      state: m.state
    }));

    socket.emit('room-data', {
      members: Object.keys(memberKeys),
      memberKeys,
      encryptedMessages
    });

    console.log(`[REJOIN] ${username} rejoined ${roomId}`);
  });

  // ---------- 7. SEND ENCRYPTED MESSAGE ----------
  socket.on('send-encrypted-message', ({ roomId, encryptedData, iv, senderUsername }) => {
    const username = socketToUser.get(socket.id);
    if (!username || username !== senderUsername) {
      socket.emit('error', { message: 'Authentication failed' });
      return;
    }

    if (!db.isRoomMember(roomId, username)) {
      socket.emit('error', { message: 'Not a room member' });
      return;
    }

    const messageId = generateMessageId();

    // Store in database
    db.storeMessage(messageId, roomId, username, encryptedData, iv);

    const message = {
      id: messageId,
      encryptedData,
      iv,
      senderUsername: username,
      timestamp: Date.now(),
      state: db.MessageState.PENDING
    };

    // Broadcast to room
    io.to(roomId).emit('new-encrypted-message', message);

    // Auto-mark as delivered for online recipients
    const onlineMembers = getOnlineMembers(roomId);
    const onlineRecipients = onlineMembers
      .filter(m => m.username !== username)
      .map(m => m.username);

    if (onlineRecipients.length > 0) {
      db.markMessageDelivered(messageId, username);

      // Notify about delivery
      setTimeout(() => {
        notifyMessageStateChange(roomId, messageId, db.MessageState.DELIVERED, 'system');
      }, 100);
    }

    console.log(`[MSG] ${username} -> ${roomId} (${messageId})`);
  });

  // ---------- 8. ACKNOWLEDGE MESSAGE DELIVERY ----------
  socket.on('ack-message', ({ messageId, roomId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) return;

    const result = db.markMessageDelivered(messageId, username);
    if (result.changes > 0) {
      notifyMessageStateChange(roomId, messageId, db.MessageState.DELIVERED, username);
    }
  });

  // ---------- 9. MARK MESSAGE AS READ ----------
  socket.on('read-message', ({ messageId, roomId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) return;

    const result = db.markMessageRead(messageId, username);
    if (result.changes > 0) {
      notifyMessageStateChange(roomId, messageId, db.MessageState.READ, username);
    }
  });

  // ---------- 10. TYPING INDICATOR ----------
  socket.on('typing', ({ roomId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) return;

    if (db.isRoomMember(roomId, username)) {
      socket.to(roomId).emit('user-typing', { username });
    }
  });

  // ---------- 11. LEAVE ROOM ----------
  socket.on('leave-room', ({ roomId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) return;

    const room = db.getRoomById(roomId);
    if (!room) return;

    // Remove from database
    db.removeRoomMember(roomId, username);

    // Leave socket.io room
    socket.leave(roomId);
    socketToRooms.get(socket.id)?.delete(roomId);

    // Notify others
    io.to(roomId).emit('member-left', { username });

    const memberKeys = getMemberKeysObject(roomId);
    io.to(roomId).emit('members-update', {
      members: Object.keys(memberKeys),
      memberKeys
    });

    // If owner leaves, delete room and all associated data (ephemeral mode)
    if (room.owner_username === username) {
      db.deleteRoomComplete(roomId);
      io.to(roomId).emit('room-closed');
      console.log(`[ROOM-CLOSED] ${roomId} (owner left, ephemeral cleanup complete)`);
    }

    console.log(`[LEAVE] ${username} left ${roomId}`);
  });

  // ---------- 12. GET USER ROOMS (for reconnection) ----------
  socket.on('get-my-rooms', () => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      socket.emit('my-rooms', { rooms: [] });
      return;
    }

    // Get all rooms user is member of
    const rooms = db.getUserRooms(username);
    socket.emit('my-rooms', { rooms });
  });

  // ---------- 13. DISCONNECT ----------
  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      console.log(`[DISCONNECT] ${socket.id} (unregistered)`);
      return;
    }

    // Update last seen in database
    db.updateLastSeen(username);

    // Notify rooms about member going offline
    const userRooms = socketToRooms.get(socket.id) || new Set();
    for (const roomId of userRooms) {
      io.to(roomId).emit('member-offline', { username });
    }

    // Clean up socket mappings (but keep user in DB!)
    socketToUser.delete(socket.id);
    userToSocket.delete(username);
    socketToRooms.delete(socket.id);

    console.log(`[DISCONNECT] ${username} (session ended, data persisted)`);
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

function shutdown() {
  console.log('\n[SHUTDOWN] Closing server...');

  io.close(() => {
    console.log('[SHUTDOWN] Socket.IO closed');
  });

  httpServer.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');
  });

  if (httpsServer) {
    httpsServer.close(() => {
      console.log('[SHUTDOWN] HTTPS server closed');
    });
  }

  // Close database and exit
  setTimeout(() => {
    db.close();
    process.exit(0);
  }, 1000);

  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('[SHUTDOWN] Forcing exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ==================== START SERVER ====================

async function startServer() {
  try {
    // Initialize database first (async)
    await db.initializeDatabase();

    // Initialize room counter from DB
    initializeRoomCounter();

    // Get network info for display
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';

    const priorityOrder = ['Wi-Fi', 'Ethernet', 'en0', 'eth0', 'wlan0'];
    for (const priority of priorityOrder) {
      for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes(priority.toLowerCase())) {
          for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
              localIP = iface.address;
              break;
            }
          }
        }
        if (localIP !== 'localhost') break;
      }
      if (localIP !== 'localhost') break;
    }

    const stats = db.getStats();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`[HTTP] Server running on http://localhost:${PORT}`);
    });

    // Start HTTPS server if certificates exist
    if (hasSSL && httpsServer) {
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🔐 E2E ENCRYPTED MESSENGER SERVER (SQLite + HTTPS)             ║
║                                                                  ║
║   📱 PHONE CONNECTION (use this URL):                            ║
║   https://${localIP}:${HTTPS_PORT}                                     ║
║                                                                  ║
║   💻 PC Connection:                                              ║
║   http://localhost:${PORT}                                           ║
║                                                                  ║
║   Features:                                                      ║
║   • End-to-end encryption (server never sees plaintext)          ║
║   • SQLite persistence (data survives restarts)                  ║
║   • HTTPS for secure offline mobile connections                  ║
║   • Room-based messaging with owner approval                     ║
║                                                                  ║
║   Database Stats:                                                ║
║   • Users: ${String(stats.users).padEnd(5)} Rooms: ${String(stats.rooms).padEnd(5)} Messages: ${String(stats.messages).padEnd(5)}       ║
║                                                                  ║
║   ⚠️  First time on phone? Tap "Advanced" → "Proceed anyway"     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        `);
      });
    } else {
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🔐 E2E ENCRYPTED MESSENGER SERVER (SQLite Edition)             ║
║                                                                  ║
║   Running on port ${PORT}                                            ║
║                                                                  ║
║   ⚠️  HTTPS not enabled - generate SSL certificates:             ║
║   openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem \\       ║
║     -out ssl/cert.pem -days 365 -nodes -subj "/CN=SecureChat"    ║
║                                                                  ║
║   Database Stats:                                                ║
║   • Users: ${String(stats.users).padEnd(5)} Rooms: ${String(stats.rooms).padEnd(5)} Messages: ${String(stats.messages).padEnd(5)}       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    }
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
