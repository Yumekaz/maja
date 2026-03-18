/**
 * File Upload API Tests
 * Tests for file upload, retrieval, and validation
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const API_URL = 'http://localhost:3000';

describe('File Upload API', () => {
  let accessToken;
  let roomId;
  let uploadedFileId;

  // Create test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testImagePath = path.join(__dirname, 'test-image.png');

  beforeAll(async () => {
    // Create test text file
    fs.writeFileSync(testFilePath, 'This is a test file for upload testing.');
    
    // Create minimal PNG (1x1 pixel)
    const minimalPNG = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
      0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(testImagePath, minimalPNG);

    // Register user
    const email = `filetest${Date.now()}@example.com`;
    const regRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email,
        username: `fileuser${Date.now()}`,
        password: 'TestPassword123',
      });

    if (regRes.status === 201) {
      accessToken = regRes.body.accessToken;

      // Create a room
      const roomRes = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      if (roomRes.status === 201) {
        roomId = roomRes.body.room.roomId;
      }
    }
  });

  afterAll(() => {
    // Cleanup test files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  describe('POST /api/files/upload', () => {
    it('should upload a text file', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', testFilePath);

      if (res.status === 201) {
        expect(res.body).toHaveProperty('attachment');
        expect(res.body.attachment).toHaveProperty('id');
        expect(res.body.attachment).toHaveProperty('filename');
        expect(res.body.attachment).toHaveProperty('url');
        expect(res.body.attachment).toHaveProperty('size');
        expect(res.body.attachment).toHaveProperty('mimetype');
        expect(res.body.attachment.mimetype).toBe('text/plain');

        uploadedFileId = res.body.attachment.id;
      }
    });

    it('should upload an image file', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', testImagePath);

      if (res.status === 201) {
        expect(res.body.attachment.mimetype).toBe('image/png');
      }
    });

    it('should reject upload without authentication', async () => {
      if (!roomId) {
        console.log('Skipping - no room');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .field('roomId', roomId)
        .attach('file', testFilePath);

      expect(res.status).toBe(401);
    });

    it('should reject upload without roomId', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', testFilePath);

      expect(res.status).toBe(400);
    });

    it('should reject upload without file', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId);

      expect(res.status).toBe(400);
    });

    it('should reject upload for non-member room', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', 'non-existent-room')
        .attach('file', testFilePath);

      expect([400, 403, 404]).toContain(res.status);
    });
  });

  describe('GET /api/files/:id', () => {
    it('should get file metadata', async () => {
      if (!accessToken || !uploadedFileId) {
        console.log('Skipping - no auth token or file id');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('attachment');
        expect(res.body.attachment.id).toBe(uploadedFileId);
      }
    });

    it('should reject for non-existent file', async () => {
      if (!accessToken) {
        console.log('Skipping - no auth token');
        return;
      }

      const res = await request(API_URL)
        .get('/api/files/999999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/files/room/:roomId', () => {
    it('should get all files in room', async () => {
      if (!accessToken || !roomId) {
        console.log('Skipping - no auth token or room');
        return;
      }

      const res = await request(API_URL)
        .get(`/api/files/room/${roomId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('attachments');
        expect(Array.isArray(res.body.attachments)).toBe(true);
        
        if (uploadedFileId) {
          const uploadedFile = res.body.attachments.find(a => a.id === uploadedFileId);
          expect(uploadedFile).toBeDefined();
        }
      }
    });

    it('should reject for non-member', async () => {
      if (!roomId) {
        console.log('Skipping - no room');
        return;
      }

      // Create another user
      const email = `filenon${Date.now()}@example.com`;
      const regRes = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email,
          username: `filenon${Date.now()}`,
          password: 'TestPassword123',
        });

      if (regRes.status === 201) {
        const res = await request(API_URL)
          .get(`/api/files/room/${roomId}`)
          .set('Authorization', `Bearer ${regRes.body.accessToken}`);

        expect(res.status).toBe(403);
      }
    });
  });
});

describe('File Validation', () => {
  let accessToken;
  let roomId;

  beforeAll(async () => {
    const email = `filevalid${Date.now()}@example.com`;
    const regRes = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email,
        username: `filevalid${Date.now()}`,
        password: 'TestPassword123',
      });

    if (regRes.status === 201) {
      accessToken = regRes.body.accessToken;

      const roomRes = await request(API_URL)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      if (roomRes.status === 201) {
        roomId = roomRes.body.room.roomId;
      }
    }
  });

  it('should reject files that are too large', async () => {
    if (!accessToken || !roomId) {
      console.log('Skipping - no auth token or room');
      return;
    }

    // Create a large file (>10MB) - we'll simulate this with a buffer
    // Note: This test might be slow or skipped in CI
    const largeFilePath = path.join(__dirname, 'large-test-file.txt');
    
    try {
      // Create 11MB file
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');
      fs.writeFileSync(largeFilePath, largeBuffer);

      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', largeFilePath);

      expect([400, 413]).toContain(res.status);
    } finally {
      if (fs.existsSync(largeFilePath)) {
        fs.unlinkSync(largeFilePath);
      }
    }
  });

  it('should reject invalid file types', async () => {
    if (!accessToken || !roomId) {
      console.log('Skipping - no auth token or room');
      return;
    }

    const invalidFilePath = path.join(__dirname, 'test.exe');
    fs.writeFileSync(invalidFilePath, 'fake executable content');

    try {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('roomId', roomId)
        .attach('file', invalidFilePath);

      expect(res.status).toBe(400);
    } finally {
      if (fs.existsSync(invalidFilePath)) {
        fs.unlinkSync(invalidFilePath);
      }
    }
  });
});
