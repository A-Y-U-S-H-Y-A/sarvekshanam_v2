'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const dbModule = require('../../src/db/database');
const { createTestDb } = require('../helpers/testDb');
const { _resetAppointmentService } = require('../../src/services/appointmentService');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const crypto = require('crypto');

describe('Appointment Routes Integration', () => {
  let User, Appointment, user, token, adminToken, app, testDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    dbModule._setDb(testDb);
    _resetAppointmentService();
    app = createApp();

    const db = dbModule.getDb();
    User = db.User;
    Appointment = db.Appointment;

    user = await User.create({
      id: crypto.randomUUID(),
      username: 'appointment_user_' + Date.now(),
      password_hash: 'hash',
      role: 'viewer'
    });

    const admin = await User.create({
      id: crypto.randomUUID(),
      username: 'appointment_admin_' + Date.now(),
      password_hash: 'hash',
      role: 'admin'
    });

    token      = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret);
    adminToken = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, config.jwtSecret);
  });

  // ── POST /api/appointments ─────────────────────────────────────────────────
  it('POST /api/appointments - should create an appointment', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Scan Appointment' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.appointment.name).toBe('New Scan Appointment');
  });

  it('POST /api/appointments - should return 400 when name missing', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  // ── GET /api/appointments ──────────────────────────────────────────────────
  it('GET /api/appointments - should list appointments', async () => {
    // Create an appointment first
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Listed Appointment' });

    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.appointments.length).toBeGreaterThan(0);
  });

  it('GET /api/appointments - filters by status param', async () => {
    const res = await request(app)
      .get('/api/appointments?status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // ── GET /api/appointments/:id ──────────────────────────────────────────────
  it('GET /api/appointments/:id - should get a single appointment', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Single Appt' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .get(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.appointment.id).toBe(apptId);
  });

  it('GET /api/appointments/:id - should return 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/appointments/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  // ── PUT /api/appointments/:id ──────────────────────────────────────────────
  it('PUT /api/appointments/:id - should update an appointment', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Update Me' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .put(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.data.appointment.name).toBe('Updated Name');
    expect(res.body.data.appointment.status).toBe('closed');
  });

  it('PUT /api/appointments/:id - should return 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/appointments/non-existent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  // ── DELETE /api/appointments/:id ───────────────────────────────────────────
  it('DELETE /api/appointments/:id - should delete an appointment', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delete Me' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .delete(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Appointment deleted');
  });

  // ── GET /api/appointments/:id/scans ───────────────────────────────────────
  it('GET /api/appointments/:id/scans - should return linked scans', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Scans Appt' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .get(`/api/appointments/${apptId}/scans`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.scans)).toBe(true);
  });

  // ── GET /api/appointments/:id/chats ───────────────────────────────────────
  it('GET /api/appointments/:id/chats - should return linked chats', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chats Appt' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .get(`/api/appointments/${apptId}/chats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.chats)).toBe(true);
  });

  // ── POST /api/appointments/:id/chats ──────────────────────────────────────
  it('POST /api/appointments/:id/chats - should create a chat', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chat Create Appt' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .post(`/api/appointments/${apptId}/chats`)
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'groq', model: 'llama3', messages: [{ role: 'user', content: 'test' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.chat.messages[0].content).toBe('test');
  });

  // ── GET /api/appointments/:id/context ─────────────────────────────────────
  it('GET /api/appointments/:id/context - should return full context', async () => {
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Context Appt' });

    const apptId = created.body.data.appointment.id;

    const res = await request(app)
      .get(`/api/appointments/${apptId}/context`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.context.id).toBe(apptId);
  });

  it('GET /api/appointments/:id/context - should return 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/appointments/non-existent-id/context')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
