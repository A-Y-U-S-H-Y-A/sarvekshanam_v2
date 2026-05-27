'use strict';

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret';

// Mock LangChain before requiring anything
jest.mock('@langchain/groq', () => ({
  ChatGroq: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () {
      yield { content: 'Port 22 is SSH. ' };
      yield { content: 'Port 80 is HTTP.' };
    })()),
  })),
}));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
jest.mock('@langchain/ollama', () => ({ ChatOllama: jest.fn() }));
jest.mock('@langchain/core/messages', () => ({
  SystemMessage: jest.fn(c => ({ _type: 'system', content: c })),
  HumanMessage:  jest.fn(c => ({ _type: 'human', content: c })),
  AIMessage:     jest.fn(c => ({ _type: 'ai', content: c })),
}));

const request  = require('supertest');
const { createTestDb }             = require('../helpers/testDb');
const dbModule                     = require('../../src/db/database');
const { _resetScanSessionService } = require('../../src/services/scanSessionService');
const { _resetCommandService }     = require('../../src/services/commandService');
const { _resetAIService }          = require('../../src/services/aiService');
const { createApp }                = require('../../src/app');

let app, testDb, token, appointmentId;

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetScanSessionService();
  _resetCommandService();
  _resetAIService();
  app = createApp();
  const res = await request(app).post('/auth/register').send({ username: 'alice', password: 'pass1234' });
  token = res.body.data.token;
  const apptRes = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'AI Route Test', mode: 'hybrid' });
  appointmentId = apptRes.body.data.appointment.id;
});

afterEach(() => {
  // No need to close the Sequelize connection between tests.
  // sync({ force: true }) in beforeEach resets all data.
});

describe('AI routes', () => {
  describe('POST /api/ai/chat', () => {
    it('streams SSE response from groq', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'groq',
          model:    'llama-3.1-8b-instant',
          appointmentId,
          messages: [{ role: 'user', content: 'What ports are open?' }],
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.text).toContain('data:');
      expect(res.text).toContain('[DONE]');
    });

    it('returns 400 when messages array is missing', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'groq' });
      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hello' }] });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ai/providers', () => {
    it('returns list of providers', async () => {
      const res = await request(app)
        .get('/api/ai/providers')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.providers)).toBe(true);
      expect(res.body.data.providers.length).toBeGreaterThanOrEqual(3);
    });
  });
});
