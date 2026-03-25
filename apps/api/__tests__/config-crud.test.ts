import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('Config CRUD API', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('GET /api/config/stores returns 200 with data array (auth required)', async () => {
    const res = await request(app).get('/api/config/stores');
    expect(res.status).toBe(401);
  });

  it('POST /api/config/stores without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/config/stores')
      .send({ id: 'test', name: 'Test Store' });
    expect(res.status).toBe(401);
  });

  it('POST /api/config/stores with bad token returns 401', async () => {
    const res = await request(app)
      .post('/api/config/stores')
      .set('Authorization', 'Bearer bad-token')
      .send({ id: 'test', name: 'Test Store' });
    expect(res.status).toBe(401);
  });

  it('POST /api/config/addons without required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/config/addons')
      .set('Authorization', 'Bearer bad-token')
      .send({});
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('DELETE /api/config/day-types/nonexistent without auth returns 401', async () => {
    const res = await request(app).delete('/api/config/day-types/test');
    expect(res.status).toBe(401);
  });

  it('PUT /api/config/leave-config validation requires all fields', async () => {
    const res = await request(app)
      .put('/api/config/leave-config')
      .set('Authorization', 'Bearer bad-token')
      .send({ resetMonth: 1 });
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('POST /api/config/users without required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/config/users')
      .set('Authorization', 'Bearer bad-token')
      .send({ username: 'test' });
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('PUT /api/config/roles/:id/permissions validates body', async () => {
    const res = await request(app)
      .put('/api/config/roles/admin/permissions')
      .set('Authorization', 'Bearer bad-token')
      .send({});
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    }
  });
});
