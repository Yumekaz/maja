/**
 * Database Module - SQLite Persistence Layer (sql.js version)
 * 
 * Uses sql.js - a pure JavaScript SQLite implementation
 * This allows running SQLite without native compilation
 * 
 * Handles all database operations for the E2E Messenger:
 * - User management (registration, public key storage)
 * - Room management (creation, membership)
 * - Message persistence (encrypted storage, state machine)
 * 
 * Message States: PENDING → DELIVERED → READ
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'messenger.db');

// Message state constants
const MessageState = {
  PENDING: 'pending',     // Message stored, recipient not yet received
  DELIVERED: 'delivered', // Recipient received the message
  READ: 'read'            // Recipient opened/read the message
};

// Database instance (set after async init)
let db = null;
let SQL = null;

/**
 * Save database to file
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Auto-save interval (every 30 seconds)
 */
let saveInterval = null;

/**
 * Initialize database (async - must be called before using other functions)
 */
async function initializeDatabase() {
  SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // Create schema
  db.run(`
    -- Users table: stores registered users and their public keys
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    );

    -- Rooms table: stores chat rooms
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT UNIQUE NOT NULL,
      room_code TEXT NOT NULL,
      owner_username TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Room members table: tracks room membership
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(room_id, username)
    );

    -- Messages table: stores encrypted messages with state
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      room_id TEXT NOT NULL,
      sender_username TEXT NOT NULL,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      state TEXT DEFAULT 'pending' CHECK(state IN ('pending', 'delivered', 'read')),
      created_at TEXT DEFAULT (datetime('now')),
      delivered_at TEXT,
      read_at TEXT
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_state ON messages(state);
    CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_code ON rooms(room_code);
  `);

  // Save to disk
  saveDatabase();

  // Start auto-save interval
  saveInterval = setInterval(saveDatabase, 30000);

  console.log('[DB] Database initialized');
  return db;
}

// ==================== HELPER ====================

function runQuery(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { changes: db.getRowsModified() };
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ==================== USER OPERATIONS ====================

function upsertUser(username, publicKey) {
  const existing = getOne('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return runQuery(
      `UPDATE users SET public_key = ?, last_seen = datetime('now') WHERE username = ?`,
      [publicKey, username]
    );
  } else {
    return runQuery(
      `INSERT INTO users (username, public_key) VALUES (?, ?)`,
      [username, publicKey]
    );
  }
}

function userExists(username) {
  return getOne('SELECT 1 FROM users WHERE username = ?', [username]) !== undefined;
}

function getUser(username) {
  return getOne('SELECT * FROM users WHERE username = ?', [username]);
}

function updateLastSeen(username) {
  return runQuery(`UPDATE users SET last_seen = datetime('now') WHERE username = ?`, [username]);
}

function deleteUser(username) {
  return runQuery('DELETE FROM users WHERE username = ?', [username]);
}

// ==================== ROOM OPERATIONS ====================

function createRoom(roomId, roomCode, ownerUsername) {
  runQuery(
    `INSERT INTO rooms (room_id, room_code, owner_username) VALUES (?, ?, ?)`,
    [roomId, roomCode, ownerUsername]
  );
  runQuery(
    `INSERT INTO room_members (room_id, username) VALUES (?, ?)`,
    [roomId, ownerUsername]
  );
  return { changes: 1 };
}

function getRoomByCode(roomCode) {
  return getOne('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
}

function getRoomById(roomId) {
  return getOne('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
}

function addRoomMember(roomId, username) {
  const existing = getOne(
    'SELECT 1 FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  );
  if (!existing) {
    return runQuery(
      `INSERT INTO room_members (room_id, username) VALUES (?, ?)`,
      [roomId, username]
    );
  }
  return { changes: 0 };
}

function removeRoomMember(roomId, username) {
  return runQuery(
    'DELETE FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  );
}

function isRoomMember(roomId, username) {
  return getOne(
    'SELECT 1 FROM room_members WHERE room_id = ? AND username = ?',
    [roomId, username]
  ) !== undefined;
}

function getRoomMembers(roomId) {
  return getAll(`
    SELECT u.username, u.public_key
    FROM room_members rm
    JOIN users u ON rm.username = u.username
    WHERE rm.room_id = ?
  `, [roomId]);
}

function deleteRoom(roomId) {
  runQuery('DELETE FROM room_members WHERE room_id = ?', [roomId]);
  runQuery('DELETE FROM messages WHERE room_id = ?', [roomId]);
  return runQuery('DELETE FROM rooms WHERE room_id = ?', [roomId]);
}

function getRoomsByOwner(username) {
  return getAll('SELECT * FROM rooms WHERE owner_username = ?', [username]);
}

function getUserRooms(username) {
  return getAll(`
    SELECT r.room_id, r.room_code, r.owner_username
    FROM rooms r
    JOIN room_members rm ON r.room_id = rm.room_id
    WHERE rm.username = ?
  `, [username]);
}

// ==================== MESSAGE OPERATIONS ====================

function storeMessage(messageId, roomId, senderUsername, encryptedData, iv) {
  return runQuery(
    `INSERT INTO messages (message_id, room_id, sender_username, encrypted_data, iv, state)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [messageId, roomId, senderUsername, encryptedData, iv]
  );
}

function getRoomMessages(roomId, limit = 100) {
  return getAll(`
    SELECT message_id, room_id, sender_username, encrypted_data, iv, state, created_at
    FROM messages
    WHERE room_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `, [roomId, limit]);
}

function markMessageDelivered(messageId, recipientUsername) {
  return runQuery(`
    UPDATE messages
    SET state = 'delivered', delivered_at = datetime('now')
    WHERE message_id = ? AND state = 'pending' AND sender_username != ?
  `, [messageId, recipientUsername]);
}

function markMessageRead(messageId, recipientUsername) {
  return runQuery(`
    UPDATE messages
    SET state = 'read', read_at = datetime('now')
    WHERE message_id = ? AND state IN ('pending', 'delivered') AND sender_username != ?
  `, [messageId, recipientUsername]);
}

function markMessagesDelivered(messageIds, recipientUsername) {
  let totalChanges = 0;
  for (const id of messageIds) {
    const result = markMessageDelivered(id, recipientUsername);
    totalChanges += result.changes;
  }
  return { changes: totalChanges };
}

function getPendingMessages(roomId, username) {
  return getAll(`
    SELECT * FROM messages
    WHERE room_id = ? AND state = 'pending' AND sender_username != ?
    ORDER BY created_at ASC
  `, [roomId, username]);
}

function getMessage(messageId) {
  return getOne('SELECT * FROM messages WHERE message_id = ?', [messageId]);
}

function deleteOldMessages(daysOld = 30) {
  return runQuery(`
    DELETE FROM messages
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `, [daysOld]);
}

// ==================== STATISTICS ====================

function getStats() {
  const userCount = getOne('SELECT COUNT(*) as count FROM users') || { count: 0 };
  const roomCount = getOne('SELECT COUNT(*) as count FROM rooms') || { count: 0 };
  const messageCount = getOne('SELECT COUNT(*) as count FROM messages') || { count: 0 };
  const messagesByState = getAll(`
    SELECT state, COUNT(*) as count FROM messages GROUP BY state
  `);

  return {
    users: userCount.count,
    rooms: roomCount.count,
    messages: messageCount.count,
    messagesByState: messagesByState.reduce((acc, row) => {
      acc[row.state] = row.count;
      return acc;
    }, {})
  };
}

// ==================== CLEANUP ====================

/**
 * Delete users who are not members of any room (ephemeral cleanup)
 */
function deleteOrphanedUsers() {
  return runQuery(`
    DELETE FROM users 
    WHERE username NOT IN (SELECT DISTINCT username FROM room_members)
  `);
}

/**
 * Complete ephemeral cleanup when room closes:
 * 1. Delete all messages in the room
 * 2. Delete all room members
 * 3. Delete the room itself
 * 4. Delete any users who are no longer in any room
 */
function deleteRoomComplete(roomId) {
  const members = getRoomMembers(roomId);
  const memberUsernames = members.map(m => m.username);

  // Delete room and associated data
  runQuery('DELETE FROM messages WHERE room_id = ?', [roomId]);
  runQuery('DELETE FROM room_members WHERE room_id = ?', [roomId]);
  runQuery('DELETE FROM rooms WHERE room_id = ?', [roomId]);

  // Delete users who were only in this room
  const result = deleteOrphanedUsers();

  console.log(`[EPHEMERAL] Room ${roomId} deleted with all data. Cleaned ${result.changes} orphaned users.`);
  return { deletedRoom: roomId, cleanedUsers: result.changes, formerMembers: memberUsernames };
}

function close() {
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  if (db) {
    saveDatabase();
    db.close();
  }
  console.log('[DB] Database connection closed');
}

module.exports = {
  // Initialization (must be called first!)
  initializeDatabase,

  // Constants
  MessageState,

  // User operations
  upsertUser,
  userExists,
  getUser,
  updateLastSeen,
  deleteUser,

  // Room operations
  createRoom,
  getRoomByCode,
  getRoomById,
  addRoomMember,
  removeRoomMember,
  isRoomMember,
  getRoomMembers,
  deleteRoom,
  getRoomsByOwner,
  getUserRooms,

  // Message operations
  storeMessage,
  getRoomMessages,
  markMessageDelivered,
  markMessageRead,
  markMessagesDelivered,
  getPendingMessages,
  getMessage,
  deleteOldMessages,

  // Utilities
  getStats,
  close,
  saveDatabase,

  // Ephemeral mode cleanup
  deleteOrphanedUsers,
  deleteRoomComplete
};
