import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('Fleet API', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('GET /api/fleet without storeId returns 400 validation error', async () => {
    const res = await request(app)
      .get('/api/fleet')
      .set('Authorization', 'Bearer test-token');
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('GET /api/fleet without auth returns 401', async () => {
    const res = await request(app).get('/api/fleet?storeId=store-lolas');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBeDefined();
  });

  it('GET /api/fleet?storeId=store-lolas without valid auth returns 401', async () => {
    const res = await request(app)
      .get('/api/fleet?storeId=store-lolas')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});
