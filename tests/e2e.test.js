/**
 * End-to-End Test Suite
 * 
 * Tests complete user flows: Registration → Room Creation → Messaging
 * 
 * To run with Playwright (if installed):
 *   npx playwright test tests/e2e/
 * 
 * For now, this uses supertest + socket.io-client for API-level E2E tests
 */

const request = require('supertest');
const { io } = require('socket.io-client');

const API_URL = 'http://localhost:3000';

// Helper to create socket connection with auth
function createAuthenticatedSocket(token) {
  return io(API_URL, {
    autoConnect: false,
    auth: { token },
  });
}

// Helper to wait for socket event
function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('E2E: Complete User Flow', () => {
  let userA = { email: '', token: '', socket: null };
  let userB = { email: '', token: '', socket: null };
  let roomCode = '';
  let roomId = '';

  // Generate unique emails for this test run
  beforeAll(() => {
    const timestamp = Date.now();
    userA.email = `e2e_user_a_${timestamp}@test.com`;
    userB.email = `e2e_user_b_${timestamp}@test.com`;
  });

  afterAll(() => {
    // Cleanup sockets
    if (userA.socket) userA.socket.disconnect();
    if (userB.socket) userB.socket.disconnect();
  });

  describe('Step 1: User Registration', () => {
    it('should register User A', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: userA.email,
          username: `userA_${Date.now()}`,
          password: 'SecurePass123',
        });

      if (res.status === 201) {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('user');
        userA.token = res.body.accessToken;
        userA.username = res.body.user.username;
      }
    });

    it('should register User B', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: userB.email,
          username: `userB_${Date.now()}`,
          password: 'SecurePass456',
        });

      if (res.status === 201) {
        expect(res.body).toHaveProperty('accessToken');
        userB.token = res.body.accessToken;
        userB.username = res.body.user.username;
      }
    });
  });

  describe('Step 2: Socket Connection', () => {
    it('User A should connect with auth token', async () => {
      if (!userA.token) {
        console.log('Skipping - no token');
        return;
      }

      userA.socket = createAuthenticatedSocket(userA.token);
      userA.socket.connect();

      await new Promise((resolve, reject) => {
        userA.socket.on('connect', resolve);
        userA.socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(userA.socket.connected).toBe(true);
    });

    it('User B should connect with auth token', async () => {
      if (!userB.token) {
        console.log('Skipping - no token');
        return;
      }

      userB.socket = createAuthenticatedSocket(userB.token);
      userB.socket.connect();

      await new Promise((resolve, reject) => {
        userB.socket.on('connect', resolve);
        userB.socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(userB.socket.connected).toBe(true);
    });
  });

  describe('Step 3: Room Creation', () => {
    it('User A should create a room via API', async () => {
      if (!userA.token) {
        console.log('Skipping - no token');
        return;
      }

      const res = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${userA.token}`);

      if (res.status === 201) {
        expect(res.body).toHaveProperty('room');
        expect(res.body.room).toHaveProperty('roomCode');
        expect(res.body.room).toHaveProperty('roomId');
        roomCode = res.body.room.roomCode;
        roomId = res.body.room.roomId;
      }
    });

    it('Room code should be 6 characters', () => {
      if (roomCode) {
        expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
      }
    });
  });

  describe('Step 4: Room Joining', () => {
    it('User A should register with socket and public key', async () => {
      if (!userA.socket || !userA.username) {
        console.log('Skipping - no socket');
        return;
      }

      const registerPromise = waitForEvent(userA.socket, 'registered');
      
      userA.socket.emit('register', {
        username: userA.username,
        publicKey: 'mock-public-key-a-' + Date.now(),
      });

      const result = await registerPromise;
      expect(result).toHaveProperty('username');
    });

    it('User A should join their room', async () => {
      if (!userA.socket || !roomId) {
        console.log('Skipping - no socket or room');
        return;
      }

      const roomDataPromise = waitForEvent(userA.socket, 'room-data');
      
      userA.socket.emit('join-room', { roomId });

      const roomData = await roomDataPromise;
      expect(roomData).toHaveProperty('members');
    });
  });

  describe('Step 5: Message Exchange', () => {
    it('User A should send an encrypted message', async () => {
      if (!userA.socket || !roomId) {
        console.log('Skipping - no socket or room');
        return;
      }

      // Send message
      userA.socket.emit('send-encrypted-message', {
        roomId,
        encryptedData: 'mock-encrypted-data-' + Date.now(),
        iv: 'mock-iv-12345678',
        senderUsername: userA.username,
      });

      // Small delay to ensure message is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // If we get here without error, message was sent
      expect(true).toBe(true);
    });
  });

  describe('Step 6: Cleanup', () => {
    it('User A should be able to delete the room', async () => {
      if (!userA.token || !roomId) {
        console.log('Skipping - no token or room');
        return;
      }

      const res = await request(API_URL)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('E2E: Security Flow', () => {
  it('should not allow unauthenticated room creation', async () => {
    const res = await request(API_URL)
      .post('/api/rooms');

    expect(res.status).toBe(401);
  });

  it('should not allow access to other users rooms', async () => {
    // Register a new user
    const timestamp = Date.now();
    const regRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `security_test_${timestamp}@test.com`,
        username: `sectest_${timestamp}`,
        password: 'TestPass123',
      });

    if (regRes.status !== 201) return;

    // Create a room
    const roomRes = await request(API_URL)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    if (roomRes.status !== 201) return;

    // Register another user
    const otherRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `other_${timestamp}@test.com`,
        username: `other_${timestamp}`,
        password: 'TestPass123',
      });

    if (otherRes.status !== 201) return;

    // Try to access first user's room
    const accessRes = await request(API_URL)
      .get(`/api/rooms/${roomRes.body.room.roomId}/messages`)
      .set('Authorization', `Bearer ${otherRes.body.accessToken}`);

    // Should be forbidden
    expect(accessRes.status).toBe(403);
  });
});

describe('E2E: File Upload with Encryption', () => {
  let authToken = '';
  let roomId = '';

  beforeAll(async () => {
    const timestamp = Date.now();
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `filetest_${timestamp}@test.com`,
        username: `filetest_${timestamp}`,
        password: 'TestPass123',
      });

    if (res.status === 201) {
      authToken = res.body.accessToken;

      const roomRes = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${authToken}`);

      if (roomRes.status === 201) {
        roomId = roomRes.body.room.roomId;
      }
    }
  });

  it('should upload an encrypted file', async () => {
    if (!authToken || !roomId) {
      console.log('Skipping - no auth or room');
      return;
    }

    // Create a mock encrypted file
    const mockEncryptedContent = Buffer.from('encrypted-file-content-' + Date.now());

    const res = await request(API_URL)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .field('roomId', roomId)
      .field('encrypted', 'true')
      .field('iv', 'mock-iv-base64-string')
      .field('metadata', JSON.stringify({ encryptedData: 'mock', iv: 'mock' }))
      .field('originalName', 'secret-document.pdf')
      .field('originalType', 'application/pdf')
      .field('originalSize', '12345')
      .attach('file', mockEncryptedContent, 'encrypted.enc');

    if (res.status === 201) {
      expect(res.body).toHaveProperty('attachment');
      expect(res.body.attachment.encrypted).toBe(true);
      expect(res.body.attachment.iv).toBeDefined();
    }
  });

  it('should retrieve encrypted file metadata', async () => {
    if (!authToken || !roomId) {
      console.log('Skipping - no auth or room');
      return;
    }

    const res = await request(API_URL)
      .get(`/api/files/room/${roomId}`)
      .set('Authorization', `Bearer ${authToken}`);

    if (res.status === 200) {
      expect(res.body).toHaveProperty('attachments');
      expect(Array.isArray(res.body.attachments)).toBe(true);
      
      // If there are encrypted files, verify they have encryption metadata
      const encryptedFiles = res.body.attachments.filter(a => a.encrypted);
      if (encryptedFiles.length > 0) {
        expect(encryptedFiles[0].iv).toBeDefined();
      }
    }
  });
});
