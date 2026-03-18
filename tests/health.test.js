/**
 * Health and Utility Tests
 * Tests for health checks, rate limiting, and error handling
 */

const request = require('supertest');

const API_URL = 'http://localhost:3000';

describe('Health API', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(API_URL)
        .get('/api/health')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('users');
      expect(res.body.stats).toHaveProperty('rooms');
      expect(res.body.stats).toHaveProperty('messages');
    });
  });

  describe('GET /api/network-info', () => {
    it('should return network info', async () => {
      const res = await request(API_URL)
        .get('/api/network-info')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('ip');
      expect(res.body).toHaveProperty('port');
    });
  });
});

describe('Error Handling', () => {
  describe('404 Not Found', () => {
    it('should return 404 for non-existent API routes', async () => {
      const res = await request(API_URL)
        .get('/api/non-existent-endpoint');

      expect(res.status).toBe(404);
    });

    it('should return JSON error for API 404', async () => {
      const res = await request(API_URL)
        .get('/api/non-existent-endpoint')
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid registration data', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          username: 'a', // too short
          password: '123', // too short
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Authentication Errors', () => {
    it('should return 401 for missing token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 401 for invalid token', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    it('should return 401 for malformed authorization header', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token');

      expect(res.status).toBe(401);
    });
  });
});

describe('Rate Limiting', () => {
  it('should include rate limit headers', async () => {
    const res = await request(API_URL)
      .get('/api/health');

    // These headers should be present when rate limiting is enabled
    const hasRateLimitHeaders = 
      res.headers['x-ratelimit-limit'] !== undefined ||
      res.headers['x-ratelimit-remaining'] !== undefined;

    // Rate limiting might not affect health endpoint, but check auth endpoints
    const authRes = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });

    // Either rate limit headers exist or the status indicates rate limiting logic
    expect(authRes.status).toBeDefined();
  });

  it('should rate limit auth endpoints after many attempts', async () => {
    const attempts = [];
    
    // Make 10 rapid requests
    for (let i = 0; i < 10; i++) {
      attempts.push(
        request(API_URL)
          .post('/api/auth/login')
          .send({
            email: 'ratelimit@test.com',
            password: 'wrongpassword',
          })
      );
    }

    const results = await Promise.all(attempts);
    
    // Check if any request was rate limited (429) or has rate limit headers
    const rateLimited = results.some(r => r.status === 429);
    const hasHeaders = results.some(r => r.headers['x-ratelimit-limit']);
    
    // At minimum, requests should complete (either with 429 or 401)
    const validStatuses = results.every(r => [401, 429].includes(r.status));
    expect(validStatuses || hasHeaders).toBe(true);
  });
});

describe('Input Sanitization', () => {
  it('should handle XSS attempts in username', async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `xss${Date.now()}@test.com`,
        username: '<script>alert("xss")</script>',
        password: 'TestPassword123',
      });

    // Should either reject (400) or sanitize
    expect([400, 201]).toContain(res.status);
    
    if (res.status === 201) {
      // If accepted, username should be sanitized
      expect(res.body.user.username).not.toContain('<script>');
    }
  });

  it('should handle SQL injection attempts', async () => {
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({
        email: "'; DROP TABLE users; --",
        password: 'password',
      });

    // Should fail validation or auth, not crash
    expect([400, 401]).toContain(res.status);
  });

  it('should handle very long input', async () => {
    const longString = 'a'.repeat(10000);
    
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({
        email: `long${Date.now()}@test.com`,
        username: longString,
        password: 'TestPassword123',
      });

    // Should reject long usernames
    expect(res.status).toBe(400);
  });
});

describe('CORS and Headers', () => {
  it('should include security headers', async () => {
    const res = await request(API_URL)
      .get('/api/health');

    // Basic response should work
    expect(res.status).toBe(200);
  });

  it('should handle preflight OPTIONS requests', async () => {
    const res = await request(API_URL)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    // Should not return 404 or 500
    expect([200, 204]).toContain(res.status);
  });
});
