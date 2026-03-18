# E2E Messenger - Architecture Documentation

## Overview

A real-time end-to-end encrypted messenger with **SQLite persistence** and **message state machine**. The server acts as a relay and never has access to plaintext messages.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────┐         ┌─────────────────┐         ┌─────────┐          │
│   │ Client  │◄───────►│     Server      │◄───────►│ Client  │          │
│   │  (React)│   WS    │   (Node.js)     │   WS    │  (React)│          │
│   └────┬────┘         └────────┬────────┘         └────┬────┘          │
│        │                       │                       │               │
│        │                       ▼                       │               │
│        │              ┌─────────────────┐              │               │
│        │              │     SQLite      │              │               │
│        │              │   messenger.db  │              │               │
│        │              └─────────────────┘              │               │
│        │                                               │               │
│        └───────────────────────┬───────────────────────┘               │
│                                │                                        │
│                    ┌───────────▼───────────┐                           │
│                    │   E2E Encryption      │                           │
│                    │   (Client-side only)  │                           │
│                    │   • ECDH Key Exchange │                           │
│                    │   • AES-GCM Encrypt   │                           │
│                    └───────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Security Model

### What the Server NEVER Sees
- Plaintext messages
- Private keys
- Shared secrets

### What the Server Stores
- Public keys (for key exchange facilitation)
- Encrypted message blobs (ciphertext + IV)
- User metadata (username, timestamps)
- Room membership

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENCRYPTION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Alice                      Server                      Bob            │
│     │                          │                          │             │
│     │──── publicKey(A) ───────►│                          │             │
│     │                          │◄──── publicKey(B) ───────│             │
│     │◄──── publicKey(B) ───────│                          │             │
│     │                          │──── publicKey(A) ───────►│             │
│     │                          │                          │             │
│     │  [ECDH: derive shared secret from pub keys]         │             │
│     │                          │                          │             │
│     │  plaintext ──► AES-GCM(sharedSecret) ──► ciphertext │             │
│     │                          │                          │             │
│     │──── {ciphertext, iv} ───►│                          │             │
│     │                          │──── {ciphertext, iv} ───►│             │
│     │                          │                          │             │
│     │                          │    ciphertext ──► AES-GCM(sharedSecret)│
│     │                          │                    ──► plaintext       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATABASE SCHEMA                                 │
├─────────────────────────────────────────────────────────────────────────┤

┌──────────────────────┐     ┌──────────────────────┐
│        users         │     │        rooms         │
├──────────────────────┤     ├──────────────────────┤
│ id          INTEGER  │     │ id          INTEGER  │
│ username    TEXT  ◄──┼─────┼─owner_username TEXT  │
│ public_key  TEXT     │     │ room_id     TEXT  ◄──┼──┐
│ created_at  DATETIME │     │ room_code   TEXT     │  │
│ last_seen   DATETIME │     │ created_at  DATETIME │  │
└──────────────────────┘     └──────────────────────┘  │
           │                            │              │
           │                            │              │
           ▼                            ▼              │
┌──────────────────────────────────────────┐          │
│            room_members                   │          │
├──────────────────────────────────────────┤          │
│ id          INTEGER                      │          │
│ room_id     TEXT  ───────────────────────┼──────────┤
│ username    TEXT  ───────────────────────┼──┐       │
│ joined_at   DATETIME                     │  │       │
└──────────────────────────────────────────┘  │       │
                                              │       │
                                              ▼       │
┌─────────────────────────────────────────────────────┼───┐
│                    messages                          │   │
├─────────────────────────────────────────────────────┴───┤
│ id               INTEGER                                │
│ message_id       TEXT (unique)                          │
│ room_id          TEXT ──────────────────────────────────┤
│ sender_username  TEXT                                   │
│ encrypted_data   TEXT (ciphertext - server can't read)  │
│ iv               TEXT (initialization vector)           │
│ state            TEXT ('pending'|'delivered'|'read')    │
│ created_at       DATETIME                               │
│ delivered_at     DATETIME                               │
│ read_at          DATETIME                               │
└─────────────────────────────────────────────────────────┘
```

## Message State Machine

Messages follow a strict state progression:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MESSAGE STATE MACHINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌──────────┐         ┌──────────────┐         ┌──────────┐          │
│    │ PENDING  │────────►│  DELIVERED   │────────►│   READ   │          │
│    └──────────┘         └──────────────┘         └──────────┘          │
│         │                      │                       │               │
│         │                      │                       │               │
│         ▼                      ▼                       ▼               │
│    Message stored      Recipient received       Recipient opened       │
│    on server           (ack-message event)      (read-message event)   │
│                                                                         │
│                                                                         │
│    Triggers:                                                            │
│    ─────────                                                            │
│    • pending → delivered: When recipient comes online OR                │
│                           sends explicit 'ack-message' event            │
│    • delivered → read:    When recipient sends 'read-message' event     │
│                                                                         │
│    Events Emitted:                                                      │
│    ───────────────                                                      │
│    • 'message-state-changed' { messageId, state, updatedBy, timestamp } │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Transitions

| From | To | Trigger | Server Action |
|------|-----|---------|---------------|
| - | `pending` | Client sends message | Store in DB |
| `pending` | `delivered` | Recipient online OR ack | Update state, notify room |
| `delivered` | `read` | Recipient marks read | Update state, notify room |

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `register` | `{username, publicKey}` | Register user with public key |
| `create-room` | - | Create new encrypted room |
| `request-join` | `{roomCode}` | Request to join room |
| `approve-join` | `{requestId}` | Owner approves join |
| `deny-join` | `{requestId}` | Owner denies join |
| `join-room` | `{roomId}` | Reconnect to room |
| `send-encrypted-message` | `{roomId, encryptedData, iv, senderUsername}` | Send E2E message |
| `ack-message` | `{messageId, roomId}` | Acknowledge receipt |
| `read-message` | `{messageId, roomId}` | Mark as read |
| `typing` | `{roomId}` | Typing indicator |
| `leave-room` | `{roomId}` | Leave room |
| `get-my-rooms` | - | Get user's rooms |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `registered` | `{username}` | Registration success |
| `username-taken` | - | Username conflict |
| `room-created` | `{roomId, roomCode}` | Room created |
| `join-request` | `{requestId, username, publicKey, roomId}` | New join request (to owner) |
| `join-approved` | `{roomId, roomCode, memberKeys}` | Join approved |
| `join-denied` | - | Join denied |
| `room-data` | `{members, memberKeys, encryptedMessages}` | Room sync data |
| `new-encrypted-message` | `{id, encryptedData, iv, senderUsername, timestamp, state}` | New message |
| `message-state-changed` | `{messageId, state, updatedBy, timestamp}` | State update |
| `member-joined` | `{username, publicKey}` | New member |
| `member-left` | `{username}` | Member left |
| `member-offline` | `{username}` | Member disconnected |
| `members-update` | `{members, memberKeys}` | Member list update |
| `room-closed` | - | Room deleted |
| `my-rooms` | `{rooms}` | User's room list |
| `user-typing` | `{username}` | Typing indicator |
| `error` | `{message}` | Error message |

## Data Persistence Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE STRATEGY                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PERSISTED (SQLite)              │  TRANSIENT (In-Memory)             │
│   ───────────────────             │  ──────────────────────             │
│   • Users & public keys           │  • Socket ↔ User mappings          │
│   • Rooms & membership            │  • Pending join requests           │
│   • Encrypted messages            │  • Active socket.io rooms          │
│   • Message states                │  • Typing indicators               │
│   • Timestamps                    │  • Online status                   │
│                                   │                                     │
│   Survives restart: YES           │  Survives restart: NO              │
│                                   │                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
e2e-messenger/
├── server-sqlite.js      # Main server with SQLite (NEW)
├── server.js             # Original in-memory server
├── db.js                 # Database module (NEW)
├── messenger.db          # SQLite database file (created at runtime)
├── ARCHITECTURE.md       # This file
├── package.json          # Dependencies
├── client/               # React frontend source
│   └── src/
│       ├── crypto/
│       │   └── encryption.js   # E2E encryption logic
│       ├── pages/
│       │   ├── Username.jsx    # Registration
│       │   ├── Home.jsx        # Room management
│       │   └── Room.jsx        # Chat interface
│       └── components/
│           └── ...
└── public_build/         # Built frontend (production)
```

## Running the Server

### Development (SQLite version)
```bash
# Install dependencies
npm install better-sqlite3

# Run SQLite server
node server-sqlite.js
```

### Original (in-memory)
```bash
node server.js
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve React app |
| `/api/stats` | GET | Server statistics (users, rooms, messages, online) |
| `/api/network-info` | GET | Local IP and URLs for QR code generation |

## HTTPS Configuration (NEW)

The server supports both HTTP and HTTPS for mobile device connections:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HTTPS CONFIGURATION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   HTTP Server (Port 3000)         HTTPS Server (Port 3443)              │
│   ─────────────────────          ──────────────────────                 │
│   • localhost access              • Mobile device access                │
│   • PC development                • Self-signed certificate             │
│   • No certificate needed         • Web Crypto API works                │
│                                                                         │
│   SSL Certificates (ssl/ folder):                                       │
│   • key.pem  - Private key                                              │
│   • cert.pem - Self-signed certificate                                  │
│                                                                         │
│   Generate with:                                                        │
│   openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem \              │
│     -out ssl/cert.pem -days 365 -nodes -subj "/CN=SecureChat"           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Ephemeral Mode (NEW)

When the room owner leaves, ALL data is automatically deleted:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EPHEMERAL MODE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Owner clicks "Leave Room"                                             │
│           │                                                             │
│           ▼                                                             │
│   ┌───────────────────┐                                                 │
│   │ deleteRoomComplete│                                                 │
│   └─────────┬─────────┘                                                 │
│             │                                                           │
│   ┌─────────▼─────────┐                                                 │
│   │ Delete messages   │ ◄── All encrypted messages                     │
│   └─────────┬─────────┘                                                 │
│             │                                                           │
│   ┌─────────▼─────────┐                                                 │
│   │ Delete room_members│ ◄── All membership records                    │
│   └─────────┬─────────┘                                                 │
│             │                                                           │
│   ┌─────────▼─────────┐                                                 │
│   │ Delete room       │ ◄── Room itself                                │
│   └─────────┬─────────┘                                                 │
│             │                                                           │
│   ┌─────────▼─────────┐                                                 │
│   │ deleteOrphanedUsers│ ◄── Users not in any other room               │
│   └─────────┬─────────┘                                                 │
│             │                                                           │
│             ▼                                                           │
│   🗑️ Complete cleanup - no trace left!                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## QR Code Mobile Joining

The QR code in room info contains the HTTPS URL for instant mobile joining:

```
QR Code Value: https://{LOCAL_IP}:3443/?room={ROOM_CODE}

Phone scans QR → Opens URL → Auto-fills room code → Register → Join!
```

## What Makes This "Fullstack"

1. **Real Database**: SQLite with proper schema, indexes, foreign keys
2. **State Machine**: Message lifecycle management (pending → delivered → read)
3. **Business Logic**: Room ownership, join approval, member management
4. **Data Integrity**: Foreign key constraints, unique constraints
5. **Graceful Shutdown**: Proper cleanup and database closure
6. **Real-time + Persistence**: Socket.IO events + SQLite storage
7. **Reconnection Support**: Users can reconnect and sync state
8. **HTTPS Support**: Self-signed certificates for offline mobile access
9. **Ephemeral Mode**: Complete data cleanup when room closes

## Security Considerations

- Server stores only encrypted data
- Public keys are transmitted in plaintext (by design - they're public)
- No authentication beyond username (demo project)
- Room codes are 6-character hex (48-bit entropy)
- Message IDs are 16-character hex (64-bit entropy)
- HTTPS with self-signed certs for local network security

## Completed Features ✅

- [x] SQLite persistence
- [x] Message state machine
- [x] HTTPS for mobile connections
- [x] Ephemeral mode (auto-delete on room close)
- [x] QR code mobile joining
- [x] Leave room button with visual indicator

## Future Improvements

- [ ] Add JWT authentication
- [ ] Add file/image sharing (encrypted)
- [ ] Multi-device support per user
- [ ] Read receipts with per-recipient tracking
- [ ] End-to-end encrypted group key rotation

