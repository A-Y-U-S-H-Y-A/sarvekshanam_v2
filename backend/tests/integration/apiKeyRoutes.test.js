'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const dbModule = require('../../src/db/database');
const { createTestDb } = require('../helpers/testDb');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

describe('ApiKey Controller Integration', () => {
  let User, user, token, app, testDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    dbModule._setDb(testDb);
    app = createApp();
    User = dbModule.getDb().User;
    user = await User.create({
      id: crypto.randomUUID(),
      username: 'apikey_user',
      password_hash: 'hash',
      role: 'viewer'
    });
    token = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret);
  });

  it('POST /api/keys - should create a new API key', async () => {
    const res = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My First Key', scopes: ['*'] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('key'); // Raw key is returned
    expect(res.body.data.name).toBe('My First Key');
  });

  it('GET /api/keys - should list user API keys without raw key', async () => {
    const res = await request(app)
      .get('/api/keys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).not.toHaveProperty('key_hash');
    expect(res.body.data[0]).not.toHaveProperty('key'); // Raw key not returned
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('name');
  });

  it('DELETE /api/keys/:id - should revoke an API key', async () => {
    // Create one to revoke
    const createRes = await request(app)
      .post('/api/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Be Revoked' });
    
    const keyId = createRes.body.data.id;

    const revokeRes = await request(app)
      .delete(`/api/keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);

    // Verify it is revoked
    const listRes = await request(app)
      .get('/api/keys')
      .set('Authorization', `Bearer ${token}`);
    
    const revokedKey = listRes.body.data.find(k => k.id === keyId);
    expect(revokedKey.revoked_at).not.toBeNull();
  });
});
