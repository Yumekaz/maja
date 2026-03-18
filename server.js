const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory data stores
const users = new Map(); // socketId -> { username, publicKey }
const usernames = new Set();
const rooms = new Map(); // roomId -> { owner, ownerSocketId, code, members: Map<username, publicKey>, encryptedMessages: [] }
const joinRequests = new Map();
const socketToRooms = new Map();

let roomCounter = 0;
let requestCounter = 0;

// Generate secure 6-character room code
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public_build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public_build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // 1. Register with username and public key
  socket.on('register', ({ username, publicKey }) => {
    if (usernames.has(username)) {
      socket.emit('username-taken');
      return;
    }

    users.set(socket.id, { username, publicKey });
    usernames.add(username);
    socketToRooms.set(socket.id, new Set());
    
    socket.emit('registered', { username });
    console.log(`[REGISTER] ${username} with public key`);
  });

  // 2. Create encrypted room
  socket.on('create-room', () => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    const roomId = `room_${++roomCounter}`;
    const roomCode = generateRoomCode();
    
    const room = {
      owner: user.username,
      ownerSocketId: socket.id,
      code: roomCode,
      members: new Map([[user.username, user.publicKey]]),
      encryptedMessages: []
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socketToRooms.get(socket.id).add(roomId);

    socket.emit('room-created', { roomId, roomCode });
    console.log(`[ROOM] ${user.username} created ${roomCode}`);
  });

  // 3. Request to join room (include public key)
  socket.on('request-join', ({ roomCode }) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Not registered' });
      return;
    }

    let targetRoom = null;
    let targetRoomId = null;

    for (const [roomId, room] of rooms.entries()) {
      if (room.code === roomCode) {
        targetRoom = room;
        targetRoomId = roomId;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (targetRoom.members.has(user.username)) {
      socket.emit('error', { message: 'Already in room' });
      return;
    }

    const requestId = `req_${++requestCounter}`;
    joinRequests.set(requestId, {
      username: user.username,
      publicKey: user.publicKey,
      roomId: targetRoomId,
      socketId: socket.id
    });

    // Send join request to room owner
    io.to(targetRoom.ownerSocketId).emit('join-request', {
      requestId,
      username: user.username,
      publicKey: user.publicKey,
      roomId: targetRoomId
    });

    console.log(`[JOIN-REQ] ${user.username} -> ${targetRoomId}`);
  });

  // 4. Approve join request
  socket.on('approve-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    const room = rooms.get(request.roomId);
    if (!room || room.ownerSocketId !== socket.id) return;

    // Add member with their public key
    room.members.set(request.username, request.publicKey);
    
    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.join(request.roomId);
      socketToRooms.get(request.socketId).add(request.roomId);

      // Send all member public keys to new member
      const memberKeys = {};
      room.members.forEach((key, name) => {
        memberKeys[name] = key;
      });

      requesterSocket.emit('join-approved', {
        roomId: request.roomId,
        roomCode: room.code,
        memberKeys
      });

      // Send new member's public key to all existing members
      socket.to(request.roomId).emit('member-joined', {
        username: request.username,
        publicKey: request.publicKey
      });

      // Update everyone's member list
      io.to(request.roomId).emit('members-update', {
        members: Array.from(room.members.keys()),
        memberKeys
      });

      console.log(`[APPROVED] ${request.username} joined ${request.roomId}`);
    }

    joinRequests.delete(requestId);
  });

  // 5. Deny join request
  socket.on('deny-join', ({ requestId }) => {
    const request = joinRequests.get(requestId);
    if (!request) return;

    const room = rooms.get(request.roomId);
    if (!room || room.ownerSocketId !== socket.id) return;

    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (requesterSocket) {
      requesterSocket.emit('join-denied');
    }

    joinRequests.delete(requestId);
    console.log(`[DENIED] ${request.username}`);
  });

  // 6. Join existing room (for reconnection)
  socket.on('join-room', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!room || !user) {
      socket.emit('error', { message: 'Room or user not found' });
      return;
    }

    if (!room.members.has(user.username)) {
      socket.emit('error', { message: 'Not a member' });
      return;
    }

    socket.join(roomId);
    
    const memberKeys = {};
    room.members.forEach((key, name) => {
      memberKeys[name] = key;
    });

    socket.emit('room-data', {
      members: Array.from(room.members.keys()),
      memberKeys,
      encryptedMessages: room.encryptedMessages
    });
  });

  // 7. Send encrypted message - server NEVER sees plaintext
  socket.on('send-encrypted-message', ({ roomId, encryptedData, iv, senderUsername }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!room || !user || !room.members.has(user.username)) {
      socket.emit('error', { message: 'Cannot send message' });
      return;
    }

    const message = {
      encryptedData,
      iv,
      senderUsername: user.username,
      timestamp: Date.now(),
      id: crypto.randomBytes(8).toString('hex')
    };

    room.encryptedMessages.push(message);
    
    // Keep only last 100 messages
    if (room.encryptedMessages.length > 100) {
      room.encryptedMessages.shift();
    }

    io.to(roomId).emit('new-encrypted-message', message);
  });

  // 8. Typing indicator (no encryption needed)
  socket.on('typing', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (room && user && room.members.has(user.username)) {
      socket.to(roomId).emit('user-typing', { username: user.username });
    }
  });

  // 9. Leave room
  socket.on('leave-room', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!room || !user) return;

    room.members.delete(user.username);
    socket.leave(roomId);
    socketToRooms.get(socket.id)?.delete(roomId);

    // Notify others
    io.to(roomId).emit('member-left', { username: user.username });
    
    const memberKeys = {};
    room.members.forEach((key, name) => {
      memberKeys[name] = key;
    });
    
    io.to(roomId).emit('members-update', {
      members: Array.from(room.members.keys()),
      memberKeys
    });

    // Delete room if owner leaves
    if (room.ownerSocketId === socket.id) {
      rooms.delete(roomId);
      io.to(roomId).emit('room-closed');
      console.log(`[ROOM-CLOSED] ${roomId}`);
    }

    console.log(`[LEAVE] ${user.username} left ${roomId}`);
  });

  // 10. Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const userRooms = socketToRooms.get(socket.id) || new Set();
    for (const roomId of userRooms) {
      const room = rooms.get(roomId);
      if (room) {
        room.members.delete(user.username);
        io.to(roomId).emit('member-left', { username: user.username });
        
        const memberKeys = {};
        room.members.forEach((key, name) => {
          memberKeys[name] = key;
        });
        
        io.to(roomId).emit('members-update', {
          members: Array.from(room.members.keys()),
          memberKeys
        });

        if (room.ownerSocketId === socket.id) {
          rooms.delete(roomId);
          io.to(roomId).emit('room-closed');
        }
      }
    }

    users.delete(socket.id);
    usernames.delete(user.username);
    socketToRooms.delete(socket.id);

    console.log(`[DISCONNECT] ${user.username}`);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🔐 E2E ENCRYPTED MESSENGER SERVER                          ║
║                                                              ║
║   Running on port ${PORT}                                        ║
║                                                              ║
║   • Messages are end-to-end encrypted                        ║
║   • Server cannot read message contents                      ║
║   • Uses ECDH key exchange + AES-GCM encryption              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
