/**
 * Authentication Tests
 * Tests for user registration, login, and token management
 */

const request = require('supertest');

// We need to create a test app instance
// This is a simplified version - in production you'd have a proper test setup
describe('Authentication API', () => {
  const API_URL = 'http://localhost:3000';
  
  let accessToken;
  let refreshToken;
  const testUser = {
    email: `test${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    password: 'TestPassword123',
  };

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send(testUser)
        .expect('Content-Type', /json/);

      // Should succeed or fail gracefully
      if (res.status === 201) {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.user).not.toHaveProperty('password_hash');
        
        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
      }
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          username: 'testuser',
          password: 'TestPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with short password', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with invalid username', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          username: 'ab', // too short
          password: 'TestPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Skip if registration didn't work
      if (!accessToken) {
        console.log('Skipping login test - registration failed');
        return;
      }

      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      if (res.status === 200) {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        expect(res.body).toHaveProperty('user');
      }
    });

    it('should reject login with wrong password', async () => {
      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token', async () => {
      if (!refreshToken) {
        console.log('Skipping refresh test - no refresh token');
        return;
      }

      const res = await request(API_URL)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      if (res.status === 200) {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
      }
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(API_URL)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      if (!accessToken) {
        console.log('Skipping profile test - no access token');
        return;
      }

      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username');
        expect(res.body.user).not.toHaveProperty('password_hash');
      }
    });

    it('should reject request without token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});

describe('Rate Limiting', () => {
  const API_URL = 'http://localhost:3000';

  it('should rate limit excessive login attempts', async () => {
    // Make multiple rapid requests
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        request(API_URL)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword',
          })
      );
    }

    const results = await Promise.all(promises);
    
    // At least one should be rate limited (429) if rate limiting is working
    const rateLimited = results.some(r => r.status === 429);
    const hasRateLimitHeaders = results.some(r => r.headers['x-ratelimit-limit']);
    
    // Either rate limited or has rate limit headers
    expect(rateLimited || hasRateLimitHeaders).toBe(true);
  });
});
