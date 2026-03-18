# Technical Challenges & Solutions

This document captures the real problems I encountered while building this E2E encrypted messenger and how I solved them. These aren't theoretical - they're actual bugs, race conditions, and design decisions I worked through.

---

## Challenge 1: Socket.IO Authentication with JWT

### The Problem
The original app used simple username registration via Socket.IO:
```javascript
socket.emit('register', { username: 'Alice' });
```

When adding JWT authentication, I needed Socket.IO to verify tokens, but:
1. HTTP middleware (`authenticateToken`) doesn't work with WebSockets
2. Token might expire mid-conversation
3. Need to support both authenticated AND legacy users (backward compatibility)

### Initial (Broken) Approach
```javascript
// Tried to use HTTP middleware - doesn't work!
io.use(authenticateToken); // ❌ req.headers doesn't exist on socket
```

### The Solution
Created separate Socket.IO authentication middleware:

```javascript
// backend/middleware/auth.js
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    // Allow connection but mark as unauthenticated
    // This maintains backward compatibility
    socket.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    socket.user = decoded; // Attach user to socket
    next();
  } catch (err) {
    // Invalid token - still allow connection for legacy mode
    socket.user = null;
    next();
  }
}
```

Client-side token handling:
```javascript
// client/src/socket.js
const socket = io(SOCKET_URL, {
  auth: {
    token: localStorage.getItem('accessToken'),
  },
});

// Reconnect with fresh token after login
export function reconnectWithAuth() {
  socket.auth.token = localStorage.getItem('accessToken');
  socket.disconnect();
  socket.connect();
}
```

### Why This Approach?
1. **Backward compatibility**: Existing users without accounts can still use the app
2. **Graceful degradation**: Invalid token doesn't crash the connection
3. **Token refresh**: Client can reconnect with new token after refresh

### What I Learned
- WebSocket authentication is fundamentally different from HTTP
- Socket.IO's `handshake.auth` is the proper way to pass credentials
- Designing for backward compatibility adds complexity but improves UX
- Sometimes "allow but mark" is better than "reject"

### Alternative Approaches Considered
1. ❌ **Reject all unauthenticated connections** - Breaks backward compatibility
2. ❌ **Pass token in query string** - Visible in logs, security risk
3. ✅ **Use handshake.auth** - Secure, standard, flexible

---

## Challenge 2: Race Condition in Room Key Exchange

### The Problem
E2E encryption requires all room members to have each other's public keys. The flow:

1. Alice creates room → generates ECDH key pair
2. Bob joins room → needs Alice's public key to derive shared secret
3. Alice needs Bob's public key too

**The race condition:**
- Bob joins while Alice is offline
- Bob's join request is approved by stored data
- But Alice's public key might only be in memory (lost on disconnect)

### How I Discovered This
During testing:
1. User A creates room, gets key pair
2. User A closes browser (disconnects)
3. User B joins with stored room code
4. User B can't encrypt messages - no key for User A!

### The Solution
Store public keys in the database, not just in memory:

```javascript
// backend/database/db.js
createRoom(ownerId, roomCode, ownerUsername, ownerPublicKey) {
  // Store owner's public key with the room
  this.db.run(`
    INSERT INTO rooms (room_id, room_code, owner_id) 
    VALUES (?, ?, ?)
  `, [roomId, roomCode, ownerId]);
  
  // Store public key in room_members
  this.db.run(`
    INSERT INTO room_members (room_id, user_id, username, public_key)
    VALUES (?, ?, ?, ?)
  `, [roomId visually, visually visually, ownerUsername, ownerPublicKey]);
}

// When user joins, get ALL member keys from database
getRoomMembers(roomId) {
  return this.db.exec(`
    SELECT username, public_key 
    FROM room_members 
    WHERE room_id = ?
  `, [roomId]);
}
```

Socket handler update:
```javascript
socket.on('join-room', async ({ roomId }) => {
  // Get keys from DATABASE, not from connected sockets
  const members = db.getRoomMembers(roomId);
  const memberKeys = {};
  
  members.forEach(m => {
    memberKeys[m.username] = m.public_key;
  });
  
  socket.emit('room-data', { 
    members: members.map(m => m.username),
    memberKeys,  // All keys, even offline users
    encryptedMessages: db.getRoomMessages(roomId)
  });
});
```

### What I Learned
- **Ephemeral vs Persistent state**: In-memory is fast but lost on disconnect
- **Race conditions are subtle**: The app worked 90% of the time, failed randomly
- **Distributed systems are hard**: Even 2 users on same server have timing issues
- **Database as source of truth**: When in doubt, persist it

### Trade-offs Made
| Approach | Pros | Cons |
|----------|------|------|
| Memory only | Fast, simple | Lost on disconnect |
| Database only | Persistent, reliable | Slower, more queries |
| **Hybrid (chosen)** | Best of both | More complex |

The hybrid approach:
- Store in database for persistence
- Cache in memory for active sessions
- Sync on reconnect

---

## Challenge 3: Refresh Token Rotation Security

### The Problem
JWT access tokens expire (15 minutes). Users need to stay logged in. Options:
1. Long-lived access tokens (bad: if stolen, valid for days)
2. Refresh tokens (good: short access + long refresh)

But refresh tokens have their own problem:
- If attacker steals refresh token, they can generate infinite access tokens
- How do you revoke a stateless token?

### The Solution: Token Rotation
When a refresh token is used, **invalidate it and issue a new one**:

```javascript
// backend/services/authService.js
async refreshToken(oldRefreshToken) {
  // 1. Verify the refresh token exists and is valid
  const tokenData = await db.getRefreshToken(oldRefreshToken);
  if (!tokenData) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // 2. Check if expired
  if (new Date(tokenData.expires_at) < new Date()) {
    await db.revokeRefreshToken(oldRefreshToken);
    throw new AuthenticationError('Refresh token expired');
  }

  // 3. CRITICAL: Revoke the old token BEFORE issuing new one
  await db.revokeRefreshToken(oldRefreshToken);

  // 4. Issue new tokens
  const user = await db.getUserById(tokenData.user_id);
  const accessToken = this.generateAccessToken(user);
  const newRefreshToken = this.generateRefreshToken();

  // 5. Store new refresh token
  await db.createRefreshToken(user.id, newRefreshToken, '7d');

  return { accessToken, refreshToken: newRefreshToken };
}
```

### Why Rotation Matters
**Without rotation:**
```
Attacker steals refresh token → Can use forever until expiry
User uses same refresh token → Attacker still valid
```

**With rotation:**
```
Attacker steals refresh token → Uses it → Gets new token
Legitimate user tries old token → FAILS (revoked)
User knows something is wrong → Can logout-all
```

### The "Logout All Devices" Feature
```javascript
async logoutAll(userId) {
  // Revoke ALL refresh tokens for this user
  await db.revokeAllUserTokens(userId);
  // User must re-login on every device
}
```

This is critical when:
- User suspects account compromise
- User lost a device
- User wants to end all sessions

### What I Learned
- **Stateless vs Stateful trade-off**: JWTs are stateless, but refresh tokens need database
- **Defense in depth**: Rotation + short expiry + logout-all
- **Security is about limiting damage**: Can't prevent all theft, but can limit impact

### Database Schema for This
```sql
CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,  -- Soft delete for audit
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

---

## Challenge 4: Rate Limiting Without Redis

### The Problem
Need rate limiting to prevent:
- Brute force login attacks
- File upload spam
- API abuse

Standard solution is Redis, but that breaks the **offline-first** requirement. This app should work on a local network without internet or external services.

### The Solution: In-Memory Rate Limiter
```javascript
// backend/middleware/rateLimiter.js
class RateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map(); // IP -> { count, resetTime }
  }

  isRateLimited(ip) {
    const now = Date.now();
    const record = this.requests.get(ip);

    if (!record || now > record.resetTime) {
      // New window
      this.requests.set(ip, { 
        count: 1, 
        resetTime: now + this.windowMs 
      });
      return false;
    }

    if (record.count >= this.maxRequests) {
      return true; // Rate limited!
    }

    record.count++;
    return false;
  }

  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.requests) {
      if (now > record.resetTime) {
        this.requests.delete(ip);
      }
    }
  }
}

// Usage
const authLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 min

function authRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (authLimiter.isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many attempts',
      retryAfter: Math.ceil(authLimiter.getResetTime(ip) / 1000)
    });
  }
  
  next();
}
```

### Trade-offs vs Redis

| Aspect | In-Memory | Redis |
|--------|-----------|-------|
| Setup | Zero config | Requires Redis server |
| Persistence | Lost on restart | Survives restart |
| Distributed | Single server only | Multi-server |
| Offline | ✅ Works | ❌ Needs network |
| Memory | Uses Node.js heap | Separate process |

### Why In-Memory is OK Here
1. **Single server**: App designed for small groups on LAN
2. **Restart is OK**: Rate limits resetting on restart is acceptable
3. **Memory is bounded**: Cleanup prevents unlimited growth
4. **Offline requirement**: No external dependencies

### Memory Management
```javascript
// Prevent memory leak - cleanup every 5 minutes
setInterval(() => {
  authLimiter.cleanup();
  apiLimiter.cleanup();
}, 5 * 60 * 1000);
```

### What I Learned
- **Right tool for the job**: Redis is overkill for 10 users on LAN
- **Memory management matters**: Without cleanup, Map grows forever
- **Trade-offs are context-dependent**: "Best practice" depends on use case

---

## Challenge 5: File Upload Authorization

### The Problem
When user uploads a file:
1. File goes to `/uploads/abc123.jpg`
2. URL is stored in database
3. Anyone with URL can access file!

```javascript
// INSECURE - anyone can access any file
app.use('/uploads', express.static('uploads'));
```

### Why This is Bad
- User A uploads private photo to Room X
- Attacker guesses filename (or finds it in network tab)
- Attacker accesses photo without being in room

### The Solution: Verify Room Membership
```javascript
// backend/controllers/fileController.js
async uploadFile(req, res) {
  const { roomId } = req.body;
  const userId = req.user.userId;

  // 1. Verify user is member of the room
  const isMember = await db.isRoomMember(roomId, userId);
  if (!isMember) {
    throw new AuthorizationError('You are not a member of this room');
  }

  // 2. Process upload (multer already ran)
  const file = req.file;
  if (!file) {
    throw new ValidationError('No file uploaded');
  }

  // 3. Store metadata with room association
  const attachment = await db.createAttachment({
    roomId,
    userId,
    filename: file.originalname,
    filepath: file.filename,
    mimetype: file.mimetype,
    size: file.size,
  });

  res.status(201).json({ attachment });
}
```

### File Retrieval Authorization
```javascript
async getFile(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;

  // 1. Get file metadata
  const attachment = await db.getAttachment(id);
  if (!attachment) {
    throw new NotFoundError('File not found');
  }

  // 2. Verify user has access to the room this file belongs to
  const isMember = await db.isRoomMember(attachment.room_id, userId);
  if (!isMember) {
    throw new AuthorizationError('Access denied');
  }

  // 3. Return file info (or serve file)
  res.json({ attachment });
}
```

### Current Limitation (Documented)
Static file serving is still open:
```javascript
app.use('/uploads', express.static('uploads'));
```

**Why I left it this way:**
1. Serving files through Express adds latency
2. For a LAN app, security threat is lower
3. Proper fix requires streaming + auth on every request

**Production fix would be:**
```javascript
app.get('/uploads/:filename', authenticateToken, async (req, res) => {
  const attachment = await db.getAttachmentByFilename(req.params.filename);
  if (!attachment) return res.status(404).send('Not found');
  
  const isMember = await db.isRoomMember(attachment.room_id, req.user.userId);
  if (!isMember) return res.status(403).send('Forbidden');
  
  res.sendFile(path.join(__dirname, 'uploads', req.params.filename));
});
```

### What I Learned
- **Authorization != Authentication**: Logged in doesn't mean authorized
- **Defense in depth**: Check permissions at every layer
- **Document known limitations**: Better than hiding them

---

## Challenge 6: Maintaining Backward Compatibility

### The Problem
The original app worked like this:
1. User enters username
2. Socket connects with username
3. User creates/joins rooms

New auth system:
1. User registers/logs in
2. Gets JWT token
3. Socket connects with token

**Can't break existing functionality** while adding new features.

### The Solution: Dual-Mode Support
```javascript
// backend/socket/index.js
socket.on('register', async ({ username, publicKey }) => {
  // Check if this is an authenticated user
  if (socket.user) {
    // Authenticated mode - use user from JWT
    const userData = {
      odviserId: socket.user.userId,
      username: socket.user.username,
      publicKey,
      authenticated: true,
    };
    users.set(socket.id, userData);
    socket.emit('registered', { username: socket.user.username });
  } else {
    // Legacy mode - just use provided username
    // Check username availability
    const existing = Array.from(users.values())
      .find(u => u.username === username);
    
    if (existing) {
      socket.emit('username-taken');
      return;
    }

    const userData = {
      odviserId: null,
      username,
      publicKey,
      authenticated: false,
    };
    users.set(socket.id, userData);
    socket.emit('registered', { username });
  }
});
```

### Frontend Toggle
```javascript
// client/src/App.jsx
const [useNewAuth, setUseNewAuth] = useState(true);

// Render appropriate page
{currentPage === 'auth' && useNewAuth && (
  <AuthPage onAuth={handleAuth} />
)}

{currentPage === 'username' && !useNewAuth && (
  <UsernamePage onRegister={handleRegister} />
)}

// Dev toggle for testing both modes
<button onClick={() => setUseNewAuth(!useNewAuth)}>
  {useNewAuth ? 'Use Legacy Mode' : 'Use Auth Mode'}
</button>
```

### Why Both Modes?
1. **Gradual migration**: Users can adopt auth when ready
2. **Testing**: Can test old behavior still works
3. **Simplicity option**: Sometimes you just want quick chat without registration
4. **Demonstration**: Shows I can handle real-world migration scenarios

### What I Learned
- **Backward compatibility is hard**: Every change must consider existing behavior
- **Feature flags**: Toggle between modes for testing
- **Migration strategy**: Support old and new simultaneously during transition
- **Real-world constraints**: Can't always do a clean rewrite

---

## Key Takeaways

### Technical Skills Demonstrated
1. **WebSocket authentication** - Different from HTTP, requires different approach
2. **Race condition handling** - Subtle bugs that require careful state management
3. **Security patterns** - Token rotation, rate limiting, authorization
4. **Trade-off analysis** - Redis vs in-memory, security vs convenience
5. **Backward compatibility** - Supporting old and new simultaneously

### Soft Skills Demonstrated
1. **Problem decomposition** - Breaking complex issues into solvable pieces
2. **Documentation** - Explaining not just what, but why
3. **Trade-off communication** - Articulating pros/cons of approaches
4. **Learning from mistakes** - Each challenge taught something new

### What I'd Do Differently Next Time
1. **Design auth from the start** - Adding auth to existing app is harder
2. **Write integration tests first** - Would have caught race conditions earlier
3. **Document decisions as I go** - Easier than reconstructing later
4. **Plan for backward compatibility** - Consider migration from day one
