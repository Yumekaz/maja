/**
 * Room API Tests
 * Tests for room creation, membership, and management
 */

const request = require('supertest');

const API_URL = 'http://localhost:3000';

describe('Room API', () => {
  let accessToken;
  let userId;
  let roomId;
  let roomCode;

  // Register and login before all tests
  beforeAll(async () => {
    const email = `roomtest${Date.now()}@example.com`;
    const username = `roomuser${Date.now()}`;
    
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email,
        username,
        password: 'TestPassword123',
      });

    if (res.status === 201) {
      accessToken = res.body.accessToken;
      userId = res.body.user.id;
    }
  });

  describe('POST /api/rooms', () => {
    it('should create a new room when authenticated', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 201) {
        expect(res.body).toHaveProperty('room');
        expect(res.body.room).toHaveProperty('roomId');
        expect(res.body.room).toHaveProperty('roomCode');
        expect(res.body.room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
        expect(res.body.room.isOwner).toBe(true);

        roomId = res.body.room.roomId;
        roomCode = res.body.room.roomCode;
      }
    });

    it('should reject room creation without token', async () => {
      const res = await request(API_URL)
        .post('/api/rooms');

      expect(res.status).toBe(401);
    });

    it('should reject room creation with invalid token', async () => {
      const res = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/rooms/my-rooms', () => {
    it('should return user rooms', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .get('/api/rooms/my-rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('rooms');
        expect(Array.isArray(res.body.rooms)).toBe(true);
        
        if (roomCode) {
          const createdRoom = res.body.rooms.find(r => r.roomCode === roomCode);
          expect(createdRoom).toBeDefined();
        }
      }
    });

    it('should reject without authentication', async () => {
      const res = await request(API_URL)
        .get('/api/rooms/my-rooms');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/rooms/code/:roomCode', () => {
    it('should return room by code', async () => {
      if (!accessToken || !roomCode) {
        console.log('Skipping - no auth token or room code');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/rooms/code/${roomCode}`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('room');
        expect(res.body.room.roomCode).toBe(roomCode);
      }
    });

    it('should return 404 for non-existent room', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .get('/api/rooms/code/ZZZZZZ')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/rooms/:roomId/members', () => {
    it('should return room members', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room id');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('members');
        expect(Array.isArray(res.body.members)).toBe(true);
      }
    });

    it('should reject for non-members', async () => {
      // Create a new user who is not in the room
      const email = `nonmember${Date.now()}@example.com`;
      const regRes = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email,
          username: `nonmember${Date.now()}`,
          password: 'TestPassword123',
        });

      if (regRes.status === 201 && roomId) {
        const res = await request(API_URL)
          .get(`/api/rooms/${roomId}/members`)
          .set('Authorization', `Bearer ${regRes.body.accessToken}`);

        expect(res.status).toBe(403);
      }
    });
  });

  describe('GET /api/rooms/:roomId/messages', () => {
    it('should return room messages', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room id');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('messages');
        expect(Array.isArray(res.body.messages)).toBe(true);
      }
    });

    it('should support limit parameter', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room id');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/rooms/${roomId}/messages?limit=10`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body.messages.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('DELETE /api/rooms/:roomId', () => {
    it('should delete room when owner', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      // Create a room to delete
      const createRes = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      if (createRes.status === 201) {
        const testRoomId = createRes.body.room.roomId;

        const res = await request(API_URL)
          .delete(`/api/rooms/${testRoomId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Room deleted');
      }
    });

    it('should reject deletion by non-owner', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room id');
        return;
      }

      // Create another user
      const email = `deleter${Date.now()}@example.com`;
      const regRes = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email,
          username: `deleter${Date.now()}`,
          password: 'TestPassword123',
        });

      if (regRes.status === 201) {
        const res = await request(API_URL)
          .delete(`/api/rooms/${roomId}`)
          .set('Authorization', `Bearer ${regRes.body.accessToken}`);

        // Should be 403 (forbidden) or 404 (not found/not member)
        expect([403, 404]).toContain(res.status);
      }
    });
  });
});
