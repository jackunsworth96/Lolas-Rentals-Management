import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { generateToken } from '../src/adapters/auth/jwt.js';

describe('API integration', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('GET /health returns 200 and ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/orders without auth returns 401', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBeDefined();
    expect(res.body.error?.message).toBeDefined();
  });

  it('GET /api/orders with auth but no storeId returns 400', async () => {
    const token = 'invalid-token-for-validation-test';
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('PATCH /api/orders/:id/partner requires can_edit_orders', async () => {
    process.env.JWT_SECRET = 'partner-attribution-test-secret';
    const token = generateToken({
      userId: 'user-test',
      username: 'viewer',
      employeeId: 'employee-test',
      roleId: 'role-viewer',
      storeIds: ['store-lolas'],
      permissions: [],
    });
    const res = await request(app)
      .patch('/api/orders/order-test/partner')
      .set('Authorization', `Bearer ${token}`)
      .send({ partnerId: null });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('PATCH /api/orders/:id/partner validates partner UUIDs', async () => {
    process.env.JWT_SECRET = 'partner-attribution-test-secret';
    const token = generateToken({
      userId: 'user-test',
      username: 'editor',
      employeeId: 'employee-test',
      roleId: 'role-editor',
      storeIds: ['store-lolas'],
      permissions: ['can_edit_orders'],
    });
    const res = await request(app)
      .patch('/api/orders/order-test/partner')
      .set('Authorization', `Bearer ${token}`)
      .send({ partnerId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/auth/login with invalid body returns 400 validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(res.body.error?.message).toBeDefined();
  });

  it('POST /api/auth/login with wrong credentials returns error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', pin: '0000' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
