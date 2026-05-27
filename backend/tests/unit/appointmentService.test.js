'use strict';

const { getAppointmentService, AppointmentService, _resetAppointmentService } = require('../../src/services/appointmentService');
const dbModule = require('../../src/db/database');
const { createTestDb } = require('../helpers/testDb');
const crypto = require('crypto');

describe('AppointmentService Unit Tests', () => {
  let svc, testDb, User, Appointment, ScanSession, AppointmentChat, user;

  beforeEach(async () => {
    testDb = await createTestDb();
    dbModule._setDb(testDb);
    _resetAppointmentService();
    svc = getAppointmentService();

    User = testDb.User;
    Appointment = testDb.Appointment;
    ScanSession = testDb.ScanSession;
    AppointmentChat = testDb.AppointmentChat;

    user = await User.create({
      id: crypto.randomUUID(),
      username: 'appt_svc_user_' + Date.now(),
      password_hash: 'hash',
      role: 'viewer'
    });
  });

  // ── Singleton ──────────────────────────────────────────────────────────────
  it('_resetAppointmentService resets the singleton', () => {
    const s1 = getAppointmentService();
    _resetAppointmentService();
    const s2 = getAppointmentService();
    expect(s1).not.toBe(s2);
  });

  // ── create ─────────────────────────────────────────────────────────────────
  it('create() creates an appointment and emits event', async () => {
    const events = [];
    svc.on('appointment:update', e => events.push(e));

    const appt = await svc.create(user.id, { name: 'Test Appointment' });
    expect(appt).toBeDefined();
    expect(appt.name).toBe('Test Appointment');
    expect(appt.status).toBe('active');
    expect(events).toHaveLength(1);
  });

  // ── get ────────────────────────────────────────────────────────────────────
  it('get() returns an appointment by id', async () => {
    const appt = await svc.create(user.id, { name: 'Get Test' });
    const found = await svc.get(appt.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(appt.id);
  });

  it('get() returns null for missing id', async () => {
    const result = await svc.get('non-existent-id');
    expect(result).toBeNull();
  });

  // ── list ───────────────────────────────────────────────────────────────────
  it('list() returns appointments for a user', async () => {
    await svc.create(user.id, { name: 'Appt 1' });
    await svc.create(user.id, { name: 'Appt 2' });
    const { appointments, total } = await svc.list(user.id);
    expect(total).toBe(2);
    expect(appointments).toHaveLength(2);
  });

  it('list() filters by status', async () => {
    await svc.create(user.id, { name: 'Active Appt' });
    const appt2 = await svc.create(user.id, { name: 'Closed Appt' });
    await svc.update(appt2.id, { status: 'closed' });

    const { appointments } = await svc.list(user.id, { status: 'active' });
    expect(appointments.every(a => a.status === 'active')).toBe(true);
  });

  // ── update ─────────────────────────────────────────────────────────────────
  it('update() modifies an appointment and emits event', async () => {
    const appt = await svc.create(user.id, { name: 'Original' });
    const events = [];
    svc.on('appointment:update', e => events.push(e));

    const updated = await svc.update(appt.id, { name: 'Updated', mode: 'scheduled', status: 'closed' });
    expect(updated.name).toBe('Updated');
    expect(updated.status).toBe('closed');
    expect(events).toHaveLength(1);
  });

  it('update() returns null for non-existent appointment', async () => {
    const result = await svc.update('non-existent', { name: 'X' });
    expect(result).toBeNull();
  });

  // ── delete ─────────────────────────────────────────────────────────────────
  it('delete() removes an appointment', async () => {
    const appt = await svc.create(user.id, { name: 'To Delete' });
    await svc.delete(appt.id);
    const found = await svc.get(appt.id);
    expect(found).toBeNull();
  });

  // ── linkScan ───────────────────────────────────────────────────────────────
  it('linkScan() associates a scan session with an appointment', async () => {
    const appt = await svc.create(user.id, { name: 'Scan Link Appt' });
    const session = await ScanSession.create({
      id: crypto.randomUUID(),
      user_id: user.id,
      name: 'Test Scan',
      mode: 'single',
      targets: JSON.stringify(['1.2.3.4']),
      module_ids: JSON.stringify(['nmap-quick-scan']),
      params: JSON.stringify({}),
      status: 'pending'
    });

    const events = [];
    svc.on('appointment:update', e => events.push(e));

    await svc.linkScan(appt.id, session.id);
    expect(events).toHaveLength(1);
  });

  // ── linkChat ───────────────────────────────────────────────────────────────
  it('linkChat() creates a chat turn and emits event', async () => {
    const appt = await svc.create(user.id, { name: 'Chat Appt' });
    const events = [];
    svc.on('appointment:update', e => events.push(e));

    const chat = await svc.linkChat(appt.id, {
      provider: 'groq',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello AI' }]
    });

    expect(chat).toBeDefined();
    expect(chat.messages[0].content).toBe('Hello AI');
    expect(events).toHaveLength(1); // appointment update
  });

  // ── getScans ───────────────────────────────────────────────────────────────
  it('getScans() returns sessions linked to an appointment', async () => {
    const appt = await svc.create(user.id, { name: 'Scan History Appt' });
    await ScanSession.create({
      id: crypto.randomUUID(),
      user_id: user.id,
      appointment_id: appt.id,
      name: 'Linked Scan',
      mode: 'single',
      targets: JSON.stringify(['10.0.0.1']),
      module_ids: JSON.stringify(['nmap-quick-scan']),
      params: JSON.stringify({}),
      status: 'completed'
    });

    const scans = await svc.getScans(appt.id);
    expect(scans).toHaveLength(1);
    expect(scans[0].name).toBe('Linked Scan');
  });

  // ── getChats ───────────────────────────────────────────────────────────────
  it('getChats() returns chats for an appointment', async () => {
    const appt = await svc.create(user.id, { name: 'Chat History Appt' });
    await svc.linkChat(appt.id, { provider: 'groq', model: 'llama3', messages: [] });
    await svc.linkChat(appt.id, { provider: 'openai', model: 'gpt4', messages: [] });

    const chats = await svc.getChats(appt.id);
    expect(chats).toHaveLength(2);
  });

  // ── getFullContext ─────────────────────────────────────────────────────────
  it('getFullContext() returns appointment with scans and chats', async () => {
    const appt = await svc.create(user.id, { name: 'Full Context Appt' });
    await svc.linkChat(appt.id, { provider: 'groq', model: 'llama3', messages: [{ role: 'user', content: 'test' }] });

    const ctx = await svc.getFullContext(appt.id);
    expect(ctx).not.toBeNull();
    expect(ctx.id).toBe(appt.id);
    expect(Array.isArray(ctx.scans)).toBe(true);
    expect(Array.isArray(ctx.chats)).toBe(true);
    expect(ctx.chats).toHaveLength(1);
  });

  it('getFullContext() returns null for missing appointment', async () => {
    const result = await svc.getFullContext('non-existent');
    expect(result).toBeNull();
  });

  // ── _tryParse (via _chatFromModel) ──────────────────────────────────────────
  it('_chatFromModel handles invalid JSON in messages_json gracefully', async () => {
    const appt = await svc.create(user.id, { name: 'JSON Parse Err Test' });
    // Create a chat with invalid (non-parseable) messages_json
    const chatId = crypto.randomUUID();
    await AppointmentChat.create({
      id: chatId,
      appointment_id: appt.id,
      provider: null,
      model: null,
      messages_json: 'not-valid-json'
    });
    const chats = await svc.getChats(appt.id);
    // _tryParse should return fallback [] on parse error
    expect(chats[0].messages).toEqual([]);
  });

  it('_tryParse returns fallback for already-parsed objects', async () => {
    // Calling _tryParse with a non-string value that is not null should return it as-is
    const svcInstance = getAppointmentService();
    expect(svcInstance._tryParse([1, 2, 3], [])).toEqual([1, 2, 3]);
    expect(svcInstance._tryParse(null, 'fallback')).toBe('fallback');
    expect(svcInstance._tryParse(undefined, 'fallback')).toBe('fallback');
  });
});
