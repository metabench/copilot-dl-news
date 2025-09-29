const request = require('supertest');
const { createApp } = require('../server');
const { createTestDb } = require('./helpers/test-helpers');

describe('Milestones SSR', () => {
  let app;
  let db;
  let server;

  beforeAll((done) => {
    db = createTestDb();
    app = createApp({ dbPath: db.dbPath, UI_FAKE_RUNNER: '1' });
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(() => {
      db.close();
      done();
    });
  });

  test('renders milestones page', async () => {
    const res = await request(server).get('/milestones/ssr');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Milestones</h1>');
  });
});
